import { cookies } from "next/headers";
import { Suspense } from "react";

import { auth } from "@/app/(auth)/auth";
import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { generateUUID } from "@/lib/utils";
import { GuestGate } from "./guest-gate";

export default function NewChatRoute() {
	return (
		<Suspense fallback={<div className="flex h-dvh" />}>
			<NewChatPage />
		</Suspense>
	);
}

async function NewChatPage() {
	const session = await auth();
	if (!session) {
		return <GuestGate />;
	}

	const cookieStore = await cookies();
	const modelIdFromCookie = cookieStore.get("chat-model");
	const id = generateUUID();

	if (!modelIdFromCookie) {
		return (
			<>
				<Chat
					autoResume={false}
					id={id}
					initialChatModel={DEFAULT_CHAT_MODEL}
					initialMessages={[]}
					initialVisibilityType="private"
					isReadonly={false}
					key={id}
				/>
				<DataStreamHandler />
			</>
		);
	}

	return (
		<>
			<Chat
				autoResume={false}
				id={id}
				initialChatModel={modelIdFromCookie.value}
				initialMessages={[]}
				initialVisibilityType="private"
				isReadonly={false}
				key={id}
			/>
			<DataStreamHandler />
		</>
	);
}
