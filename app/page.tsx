import { redirect } from "next/navigation";

// The Phase-1 landing page went with the rest of that product. Per Addendum-03
// §01 the app has exactly three global tabs and no marketing splash of its own,
// so `/` is not a screen — it is a door into the studio.
export default function Home() {
  redirect("/studio/campaign");
}
