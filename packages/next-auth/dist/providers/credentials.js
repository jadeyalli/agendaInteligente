export default function CredentialsProvider(options) {
  if (typeof options?.authorize !== "function") {
    throw new Error("El proveedor de credenciales requiere la función 'authorize'");
  }

  const id = options.id ?? "credentials";
  const name = options.name ?? "Credentials";

  return {
    id,
    name,
    type: "credentials",
    credentials: options.credentials ?? {},
    authorize: options.authorize,
  };
}
