import Link from "next/link";
import {
  AudioLines,
  LayoutDashboard,
  Music2,
  ClipboardList,
  LogOut,
} from "lucide-react";
import { InstagramGlyph } from "@/components/icons/instagram-glyph";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/utils";
import { NavLink } from "@/components/nav-link";

export async function Navbar() {
  const session = await auth();
  const user = session?.user;
  const isAdmin = user?.role === "ADMIN";

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur">
      <div className="band-inner-wide flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
          aria-label="Shred Sound Music — home"
        >
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <AudioLines className="h-4 w-4" />
          </span>
          <span className="hidden whitespace-nowrap sm:inline">
            Shred Sound Music
          </span>
        </Link>

        <nav
          className="ml-1 flex items-center gap-1 sm:ml-4"
          aria-label="Primary"
        >
          <NavLink href="/challenges" icon={<ClipboardList className="h-4 w-4" />}>
            Challenges
          </NavLink>
          <NavLink href="/feed" icon={<Music2 className="h-4 w-4" />}>
            Feed
          </NavLink>
          {isAdmin && (
            <NavLink href="/admin" icon={<LayoutDashboard className="h-4 w-4" />}>
              Studio
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <a
            href="https://www.instagram.com/shred_sound_music/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow Shred Sound Music on Instagram"
            className="hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:inline-flex"
          >
            <InstagramGlyph className="h-4 w-4" />
          </a>
          {user ? (
            <>
              <Badge
                variant={isAdmin ? "accent" : "secondary"}
                className="hidden sm:inline-flex"
              >
                {isAdmin ? "Teacher" : "Student"}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Account menu"
                  >
                    <Avatar>
                      {user.image && <AvatarImage src={user.image} alt={user.name ?? ""} />}
                      <AvatarFallback>{getInitials(user.name ?? user.email)}</AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="font-medium">{user.name ?? "Anonymous"}</div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {user.email}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/" });
                    }}
                  >
                    <DropdownMenuItem asChild>
                      <button type="submit" className="w-full cursor-pointer">
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </DropdownMenuItem>
                  </form>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/sign-up">Sign up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
