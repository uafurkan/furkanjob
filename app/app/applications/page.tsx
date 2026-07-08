import { redirect } from "next/navigation";

// Applications now live on the Pmail page. Keep this path working for old links/bookmarks.
export default function ApplicationsRedirect() {
  redirect("/app/pmail");
}
