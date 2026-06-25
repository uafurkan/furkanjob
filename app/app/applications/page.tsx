import { redirect } from "next/navigation";

// Applications now live inside the Profile page. Keep this path working for old links/bookmarks.
export default function ApplicationsRedirect() {
  redirect("/app/profile#applications");
}
