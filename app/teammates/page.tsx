import TeammatesPage from "@/components/TeammatesPage";

export const metadata = {
  title: "Teammate Battles",
  description:
    "Who beats who inside every F1 team this season: points, race results, qualifying, fastest laps and best finish, teammate against teammate.",
  alternates: { canonical: "/teammates" },
};

export default function Teammates() {
  return <TeammatesPage />;
}
