import Link from "next/link";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { signIn } from "@/lib/auth";
import {
  signUpSchema,
  INSTRUMENT_VALUES,
  SKILL_LEVEL_VALUES,
} from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatInstrument, formatSkillLevel } from "@/lib/utils";
import type { Instrument, SkillLevel } from "@/db/schema";

export default function SignUpPage() {
  async function action(formData: FormData) {
    "use server";
    const parsed = signUpSchema.safeParse({
      name: formData.get("name"),
      email: formData.get("email"),
      password: formData.get("password"),
      confirmPassword: formData.get("confirmPassword"),
      role: "STUDENT",
      primaryInstrument: formData.get("primaryInstrument") || undefined,
      skillLevel: formData.get("skillLevel") || undefined,
    });

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Invalid input";
      redirect(`/sign-up?error=${encodeURIComponent(message)}`);
    }

    const { name, email, password, primaryInstrument, skillLevel } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing) {
      redirect("/sign-up?error=Email%20already%20in%20use");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.insert(users).values({
      name,
      email: normalizedEmail,
      passwordHash,
      role: "STUDENT",
      primaryInstrument: (primaryInstrument as Instrument | undefined) ?? null,
      skillLevel: (skillLevel as SkillLevel | undefined) ?? null,
    });

    await signIn("credentials", {
      email: normalizedEmail,
      password,
      redirectTo: "/challenges",
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join Shred Sound Music</CardTitle>
        <CardDescription>Create your student account and start posting performances.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <Input id="name" name="name" required autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="primaryInstrument">Primary instrument</Label>
              <select
                id="primaryInstrument"
                name="primaryInstrument"
                defaultValue=""
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Pick later</option>
                {INSTRUMENT_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {formatInstrument(v)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="skillLevel">Skill level</Label>
              <select
                id="skillLevel"
                name="skillLevel"
                defaultValue=""
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Pick later</option>
                {SKILL_LEVEL_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {formatSkillLevel(v)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full">
            Create account
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/sign-in" className="ml-1 font-medium text-primary hover:underline">
          Sign in
        </Link>
      </CardFooter>
    </Card>
  );
}
