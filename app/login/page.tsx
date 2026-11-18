import LoginForm from "./login-form";

// 메일 링크가 만료되면 /login?error=link 로 돌아옴
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { error } = await searchParams;
  return <LoginForm linkError={error === "link"} />;
}
