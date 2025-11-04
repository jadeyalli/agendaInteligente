export type FieldError = {
  type?: string;
  message?: string;
};

export type FormState<TFieldValues extends Record<string, unknown>> = {
  errors: Partial<Record<keyof TFieldValues | "root", FieldError>>;
  isSubmitting: boolean;
};

export type SubmitHandler<TFieldValues extends Record<string, unknown>> = (
  data: TFieldValues,
  event?: unknown,
) => void | Promise<void>;

export type UseFormOptions<TFieldValues extends Record<string, unknown>> = {
  defaultValues?: Partial<TFieldValues>;
};

export type UseFormReturn<TFieldValues extends Record<string, unknown>> = {
  watch: <TName extends keyof TFieldValues | undefined>(name?: TName) => TName extends keyof TFieldValues
    ? TFieldValues[TName]
    : TFieldValues;
  setValue: <TName extends keyof TFieldValues>(name: TName, value: TFieldValues[TName], options?: { shouldValidate?: boolean }) => void;
  reset: (values?: Partial<TFieldValues>) => void;
  register: () => Record<string, unknown>;
  handleSubmit: (callback: SubmitHandler<TFieldValues>) => (event?: unknown) => Promise<void>;
  setError: (name: keyof TFieldValues | "root", error: FieldError) => void;
  clearErrors: (name?: keyof TFieldValues | "root") => void;
  formState: FormState<TFieldValues>;
};

export declare function useForm<TFieldValues extends Record<string, unknown> = Record<string, unknown>>(
  options?: UseFormOptions<TFieldValues>,
): UseFormReturn<TFieldValues>;
