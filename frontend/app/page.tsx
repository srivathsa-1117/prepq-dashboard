import { redirect } from 'next/navigation';

/** Root path always resolves to the Overview page or /login - middleware already enforces auth, this just picks the landing product page (spec §2). */
export default function RootPage() {
  redirect('/overview');
}
