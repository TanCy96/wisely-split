export function authErrorMessage(error: { message?: string }): string {
  const message = error.message?.toLowerCase() ?? "";

  if (
    message.includes("already registered") ||
    message.includes("already exists") ||
    message.includes("already been registered")
  ) {
    return "An account already exists for this email.";
  }

  if (message.includes("invalid login credentials")) {
    return "Email or password is incorrect.";
  }

  if (message.includes("password")) {
    return "Please check your password and try again.";
  }

  return "Something went wrong. Please try again.";
}

export function authErrorRedirectPath(path: string, message: string): string {
  return `${path}?error=${encodeURIComponent(message)}`;
}
