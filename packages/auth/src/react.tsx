import { ClerkProvider } from "@clerk/nextjs";

// The app's own sign-in and sign-up pages (apps/web/app/sign-in, sign-up). Clerk's screens take the Auspex look from
// the --clerk-* variables in globals.css.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">{children}</ClerkProvider>;
}

export { Show, SignIn, SignUp, UserButton } from "@clerk/nextjs";
