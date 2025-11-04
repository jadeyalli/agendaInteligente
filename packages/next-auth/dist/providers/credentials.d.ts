import type { CredentialsAuthorizeParams, CredentialsProvider as CredentialsProviderShape, SessionUser } from "../index";

type CredentialsProviderOptions = {
  id?: string;
  name?: string;
  credentials?: Record<string, unknown>;
  authorize: (credentials: CredentialsAuthorizeParams, request: Request) => Promise<SessionUser | null> | SessionUser | null;
};

declare function CredentialsProvider(options: CredentialsProviderOptions): CredentialsProviderShape;

export default CredentialsProvider;
