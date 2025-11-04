import { useCallback, useRef, useState } from "react";

export function useForm(options = {}) {
  const defaultsRef = useRef({ ...(options?.defaultValues ?? {}) });
  const [values, setValues] = useState(() => ({ ...defaultsRef.current }));
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const watch = useCallback(
    (name) => {
      if (!name) {
        return { ...values };
      }
      return values?.[name];
    },
    [values],
  );

  const setValue = useCallback((name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const reset = useCallback((nextValues) => {
    const baseValues = nextValues ? { ...nextValues } : { ...defaultsRef.current };
    if (nextValues) {
      defaultsRef.current = { ...baseValues };
    }
    setValues(baseValues);
    setErrors({});
  }, []);

  const setError = useCallback((name, error) => {
    setErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  const clearErrors = useCallback((name) => {
    if (!name) {
      setErrors({});
      return;
    }
    setErrors((prev) => {
      if (!(name in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    (callback) => {
      return async (event) => {
        if (event && typeof event.preventDefault === "function") {
          event.preventDefault();
        }
        setIsSubmitting(true);
        try {
          await callback({ ...values }, event);
        } finally {
          setIsSubmitting(false);
        }
      };
    },
    [values],
  );

  const register = useCallback(() => {
    return {};
  }, []);

  return {
    watch,
    setValue,
    reset,
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: {
      errors,
      isSubmitting,
    },
  };
}
