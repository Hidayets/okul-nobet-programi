import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { User, LicenseSummary } from './types';

interface AuthContextType {
  user: User | null;
  license: LicenseSummary | null;
  loading: boolean;
  /** Lisansı pasif/expired bulunup oturum sonlandırıldığında set edilir. */
  licenseLockout: { reason: 'inactive' | 'expired'; message: string } | null;
  signOut: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  setLicense: React.Dispatch<React.SetStateAction<LicenseSummary | null>>;
  /** Sunucudan kullanıcı + lisans bilgisini yeniden çeker. */
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  license: null,
  loading: true,
  licenseLockout: null,
  signOut: async () => {},
  setUser: () => {},
  setLicense: () => {},
  refreshAuth: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// Her 5 dakikada bir lisans/oturum durumu yeniden doğrulansın.
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [license, setLicense] = useState<LicenseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [licenseLockout, setLicenseLockout] = useState<
    { reason: 'inactive' | 'expired'; message: string } | null
  >(null);

  // En son fetch sonucunu izleyebilmek için ref
  const userRef = useRef<User | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);

  const signOut = useCallback(async () => {
    localStorage.removeItem('token');
    setUser(null);
    setLicense(null);
  }, []);

  const refreshAuth = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setUser(null);
      setLicense(null);
      return;
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setLicense(data.license || null);
        return;
      }

      // 403 + licenseStatus → lisans pasif/expired olmuş, oturumu bitir.
      if (res.status === 403) {
        try {
          const data = await res.json();
          if (data?.licenseStatus === 'inactive' || data?.licenseStatus === 'expired') {
            setLicenseLockout({
              reason: data.licenseStatus,
              message:
                data.error ||
                (data.licenseStatus === 'inactive'
                  ? 'Lisansınız pasif duruma alınmış.'
                  : 'Lisansınızın süresi dolmuş.'),
            });
          }
        } catch {}
      }

      // 401/403 ise oturumu temizle
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('token');
        setUser(null);
        setLicense(null);
      }
    } catch (err) {
      // Ağ hatası: oturumu silme, kullanıcı yeniden bağlanınca tekrar denesin.
      console.error('refreshAuth error:', err);
    }
  }, []);

  // İlk yükleme
  useEffect(() => {
    (async () => {
      await refreshAuth();
      setLoading(false);
    })();
  }, [refreshAuth]);

  // Periyodik yenileme + pencere odak kazandığında yenileme.
  // Süresi dolmuş veya pasif edilmiş bir lisans, kullanıcı oturumunu açık
  // bıraksa bile en geç 5 dakika içinde fark edilir.
  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => {
      refreshAuth();
    }, REFRESH_INTERVAL_MS);

    const onFocus = () => refreshAuth();
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, refreshAuth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        license,
        loading,
        licenseLockout,
        signOut,
        setUser,
        setLicense,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
