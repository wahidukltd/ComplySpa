import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <SignIn
        appearance={
          { layout: { logoPlacement: "none", socialButtonsPlacement: "bottom" } } as any
        }
      />
    </div>
  );
}
