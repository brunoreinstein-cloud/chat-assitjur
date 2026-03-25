import Form from "next/form";

import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function AuthForm({
  action,
  children,
  defaultEmail = "",
  passwordAutocomplete = "current-password",
}: Readonly<{
  action: NonNullable<
    string | ((formData: FormData) => void | Promise<void>) | undefined
  >;
  children: React.ReactNode;
  defaultEmail?: string;
  /** Valor do autocomplete do campo senha. Use "new-password" no cadastro. */
  passwordAutocomplete?: "current-password" | "new-password";
}>) {
  return (
    <Form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label
          className="font-medium text-foreground text-sm"
          htmlFor="email"
        >
          E-mail
        </Label>
        <Input
          autoComplete="email"
          autoFocus
          className="bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-primary md:text-sm"
          defaultValue={defaultEmail}
          id="email"
          name="email"
          placeholder="seu@email.com…"
          required
          type="email"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label
          className="font-medium text-foreground text-sm"
          htmlFor="password"
        >
          Senha
        </Label>
        <Input
          autoComplete={passwordAutocomplete}
          className="bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-primary md:text-sm"
          id="password"
          name="password"
          placeholder="••••••••"
          required
          type="password"
        />
      </div>
      {children}
    </Form>
  );
}
