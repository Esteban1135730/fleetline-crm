import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { flushSyncQueue, subscribeQueue } from "./syncEngine";

export function useNetwork() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const unsubNet = NetInfo.addEventListener((state) => {
      const next =
        state.isConnected === true && state.isInternetReachable !== false;
      setOnline(next);
    });
    const unsubQ = subscribeQueue(setPending);
    void NetInfo.fetch().then((state) => {
      setOnline(
        state.isConnected === true && state.isInternetReachable !== false,
      );
    });
    return () => {
      unsubNet();
      unsubQ();
    };
  }, []);

  useEffect(() => {
    if (!online || pending === 0) return;
    let cancelled = false;
    void (async () => {
      setSyncing(true);
      try {
        await flushSyncQueue();
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, pending]);

  return { online, pending, syncing };
}
