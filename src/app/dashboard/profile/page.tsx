import { requireAuth } from "@/lib/auth-check";
import ProfileForm from "./ProfileForm";

export default async function ProfilePage() {
  await requireAuth("MEMBER");
  return <ProfileForm />;
}
