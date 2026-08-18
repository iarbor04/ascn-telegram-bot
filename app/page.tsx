import Dashboard from "./dashboard";

// The password is only known on the server, so the warning about an open dashboard
// has to be decided here and shipped with the first response.
export const dynamic = "force-dynamic";

export default function Page() {
  return <Dashboard adminProtected={Boolean(process.env.ADMIN_PASSWORD)} />;
}
