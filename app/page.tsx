// frontend/app/page.tsx

import ChatClient from './ChatClient';

export default function Home() {
  // This is a Server Component, so it can safely access environment variables.
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  // It's good practice to handle the case where the variable might be missing.
  if (!apiUrl) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-red-500 font-semibold">
          Configuration Error: The API URL is not set.
        </p>
      </div>
    );
  }

  // Pass the API URL as a prop to the Client Component.
  return <ChatClient apiUrl={apiUrl} />;
}