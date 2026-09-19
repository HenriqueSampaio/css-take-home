import { redirect } from "next/navigation";

// The grid is the home screen.
export default function Home() {
  redirect("/schedule");
}
