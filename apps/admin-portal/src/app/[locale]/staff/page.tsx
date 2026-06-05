import { redirect } from 'next/navigation'

export default function StaffPage() {
  redirect('/users?tab=lab-assignments')
}
