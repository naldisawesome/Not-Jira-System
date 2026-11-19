import { LoginForm } from "./form";
export const metadata = { title: "Sign in" };
export default function Page({ searchParams }: { searchParams: { callbackUrl?: string; email?: string } }) {
  return <LoginForm callbackUrl={searchParams.callbackUrl} email={searchParams.email} />;
}
