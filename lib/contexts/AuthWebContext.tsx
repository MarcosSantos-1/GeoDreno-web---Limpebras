"use client";

import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { UsuarioDoc } from "@shared/firestore";
import { auth, db } from "@/lib/firebase";

type AuthWebCtx = {
  user: User | null;
  profile: UsuarioDoc | null;
  ready: boolean;
  signInWithNome: (nome: string) => Promise<void>;
};

const Ctx = createContext<AuthWebCtx | null>(null);

export function AuthWebProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UsuarioDoc | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      try {
        if (u) {
          await u.getIdToken();
          const snap = await getDoc(doc(db, "usuarios", u.uid));
          setProfile(snap.exists() ? (snap.data() as UsuarioDoc) : null);
        } else {
          setProfile(null);
        }
      } catch (e) {
        console.error("[AuthWeb] Firestore usuarios:", e);
        setProfile(null);
      } finally {
        setReady(true);
      }
    });
    return unsub;
  }, []);

  const signInWithNome = useCallback(async (nome: string) => {
    if (!auth.currentUser) {
      await signInAnonymously(auth);
    }
    const u = auth.currentUser;
    if (!u) throw new Error("Auth indisponível");
    await u.getIdToken();
    const ref = doc(db, "usuarios", u.uid);
    const snap = await getDoc(ref);
    const trimmed = nome.trim();
    if (snap.exists()) {
      await updateDoc(ref, { nome: trimmed });
    } else {
      await setDoc(ref, {
        nome: trimmed,
        createdAt: new Date().toISOString(),
      } as UsuarioDoc);
    }
    const again = await getDoc(ref);
    setProfile(again.exists() ? (again.data() as UsuarioDoc) : null);
  }, []);

  const value = useMemo(
    () => ({ user, profile, ready, signInWithNome }),
    [user, profile, ready, signInWithNome],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuthWeb(): AuthWebCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuthWeb outside provider");
  return v;
}
