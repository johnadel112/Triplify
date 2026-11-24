"use client";
import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "./api";
export function useResource<T>(path: string) {
  const [state, setState] = useState<{
    path: string;
    data?: T;
    error?: string;
  }>({ path: "" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<T>(path, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ path, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            path,
            error:
              error instanceof ApiError
                ? error.message
                : "Unable to connect. Check your connection and try again.",
          });
      });
    return () => controller.abort();
  }, [path, revision]);
  return {
    data: state.path === path ? state.data : undefined,
    error: state.path === path ? state.error : undefined,
    loading: state.path !== path || (!state.data && !state.error),
    reload: () => {
      setState({ path: "" });
      setRevision((value) => value + 1);
    },
  };
}
