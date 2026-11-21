"use client";
import { useEffect, useState } from "react";
import { MessageSquare, Send, ArrowLeft } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { messagingApi, usersApi } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Container, PageHeader } from "@/components/ui/layout";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { getErrorMessage } from "@/lib/api/client";

interface Message {
  id: string;
  sender_id: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

interface Thread {
  id: string;
  participant_a: string;
  participant_b: string;
  subject: string | null;
  project_id: string | null;
  created_at: string;
  messages?: Message[];
}

function ThreadItem({ thread, active, onClick, currentUserId }: {
  thread: Thread; active: boolean; onClick: () => void; currentUserId: string;
}) {
  const otherUserId = thread.participant_a === currentUserId ? thread.participant_b : thread.participant_a;
  const { data: otherUser } = useQuery({
    queryKey: ["user-profile", otherUserId],
    queryFn: () => usersApi.getPublicProfile(otherUserId),
    enabled: !!otherUserId,
  });
  const otherName = otherUser?.profile?.display_name ?? "Loading person…";
  const lastMsg = thread.messages?.[thread.messages.length - 1];
  const unread = thread.messages?.filter((m) => !m.is_read && m.sender_id !== currentUserId).length ?? 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 border-b hover:bg-accent/50 transition-colors",
        active && "bg-primary/5 border-l-2 border-l-primary"
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
            {otherName === "Loading person…" ? "…" : otherName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
          </div>
          <span className="font-medium text-sm truncate">{otherName}</span>
        </div>
        {unread > 0 && (
          <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">{unread}</span>
        )}
      </div>
      {lastMsg && <p className="text-xs text-muted-foreground truncate">{lastMsg.body}</p>}
      <p className="text-[10px] text-muted-foreground/60 mt-1">
        {new Date(thread.created_at).toLocaleDateString()}
      </p>
    </button>
  );
}

function ConversationView({ threadId, currentUserId }: { threadId: string; currentUserId: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: thread, isLoading } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => messagingApi.thread(threadId),
    refetchInterval: 10_000,
  });
  const otherUserId = thread
    ? (thread.participant_a === currentUserId ? thread.participant_b : thread.participant_a)
    : "";
  const { data: otherUser } = useQuery({
    queryKey: ["user-profile", otherUserId],
    queryFn: () => usersApi.getPublicProfile(otherUserId),
    enabled: !!otherUserId,
  });

  const { mutate: send, isPending } = useMutation({
    mutationFn: () => messagingApi.send(threadId, body.trim()),
    onSuccess: () => {
      setBody("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["thread", threadId] });
      qc.invalidateQueries({ queryKey: ["threads"] });
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  if (isLoading) return <div className="flex-1 flex items-center justify-center"><Skeleton className="w-full h-full" /></div>;
  if (!thread) return null;

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center">
          {otherUser?.profile?.display_name?.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() ?? "…"}
        </div>
        <div>
          <p className="font-medium text-sm">{otherUser?.profile?.display_name ?? "Loading person…"}</p>
          {thread.project_id && (
            <p className="text-xs text-muted-foreground">Re: project</p>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {thread.messages?.map((msg: { id: string; sender_id: string; body: string; created_at: string }) => {
          const isMe = msg.sender_id === currentUserId;
          return (
            <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                isMe
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-secondary text-secondary-foreground rounded-bl-sm"
              )}>
                {msg.body}
                <p className={cn("text-[10px] mt-1 opacity-60", isMe ? "text-right" : "text-left")}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="px-5 py-4 border-t">
        {error && <p className="text-xs text-destructive mb-2">{error}</p>}
        <div className="flex gap-2">
          <textarea
            className="flex-1 px-3 py-2 text-sm rounded-xl border bg-background resize-none focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12 min-h-[40px] max-h-32"
            placeholder="Type a message…"
            value={body}
            rows={1}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (body.trim()) send();
              }
            }}
          />
          <Button size="sm" onClick={() => send()} disabled={!body.trim() || isPending} className="self-end gap-1">
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const newRecipient = searchParams.get("new");
  const newProject = searchParams.get("project") || undefined;
  const token = useAuthStore((s) => s.accessToken);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [firstMessage, setFirstMessage] = useState("");
  const [startError, setStartError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) {
      router.replace("/auth/login");
    }
  }, [router, token]);

  // Get current user id from JWT
  let currentUserId = "";
  try {
    if (token) currentUserId = JSON.parse(atob(token.split(".")[1])).sub;
  } catch {}

  const { data: threads, isLoading } = useQuery({
    queryKey: ["threads"],
    queryFn: messagingApi.threads,
    refetchInterval: 15_000,
    enabled: !!token,
  });

  useEffect(() => {
    if (!newRecipient || !threads) return;
    const existing = threads.find((thread: Thread) =>
      (thread.participant_a === newRecipient || thread.participant_b === newRecipient) &&
      (thread.project_id ?? undefined) === newProject
    );
    if (existing) setActiveThread(existing.id);
  }, [newRecipient, newProject, threads]);

  const startConversation = useMutation({
    mutationFn: () => messagingApi.start({
      recipient_id: newRecipient!,
      project_id: newProject,
      first_message: firstMessage.trim(),
    }),
    onSuccess: (thread) => {
      setFirstMessage("");
      setStartError(null);
      setActiveThread(thread.id);
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      router.replace(`/messages?thread=${thread.id}`);
    },
    onError: (err) => setStartError(getErrorMessage(err)),
  });

  useEffect(() => {
    const threadId = searchParams.get("thread");
    if (threadId) setActiveThread(threadId);
  }, [searchParams]);

  if (!token) return null;

  return (
    <Container width="lg" className="py-10">
      <PageHeader
        eyebrow="Inbox"
        title="Messages"
        icon={<MessageSquare />}
        description="Conversations with builders, buyers and founders."
      />

      <div className="rounded-xl border bg-card overflow-hidden flex h-[calc(100dvh-18rem)] min-h-[26rem]">
        {/* Thread list � full width on mobile until a thread is opened */}
        <div className={cn(
          "w-full sm:w-72 border-r flex-shrink-0 overflow-y-auto",
          activeThread && "hidden sm:block"
        )}>
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !threads?.length ? (
            <div className="flex flex-col items-center justify-center h-full py-10 text-center px-4">
              <MessageSquare className="w-8 h-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No messages yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Message a project owner from their project page.
              </p>
            </div>
          ) : (
            threads.map((t: Thread) => (
              <ThreadItem
                key={t.id}
                thread={t}
                active={activeThread === t.id}
                onClick={() => setActiveThread(t.id)}
                currentUserId={currentUserId}
              />
            ))
          )}
        </div>

        {/* Conversation */}
        {newRecipient && !activeThread ? (
          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-5 py-3 border-b flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center">M</div>
              <div>
                <p className="font-medium text-sm">New conversation</p>
                <p className="text-xs text-muted-foreground">Send your first message to start chatting.</p>
              </div>
            </div>
            <form className="mt-auto px-5 py-4 border-t" onSubmit={(event) => { event.preventDefault(); if (firstMessage.trim()) startConversation.mutate(); }}>
              {startError && <p className="text-xs text-destructive mb-2">{startError}</p>}
              <div className="flex gap-2">
                <textarea
                  className="flex-1 px-3 py-2 text-sm rounded-xl border bg-background resize-none focus-visible:outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/12 min-h-[40px] max-h-32"
                  placeholder="Type your message…"
                  value={firstMessage}
                  rows={2}
                  maxLength={3000}
                  onChange={(event) => setFirstMessage(event.target.value)}
                />
                <Button size="sm" type="submit" disabled={!firstMessage.trim() || startConversation.isPending} className="self-end gap-1">
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            </form>
          </div>
        ) : activeThread ? (
          <div className="flex-1 flex flex-col min-w-0">
            <button
              onClick={() => setActiveThread(null)}
              className="sm:hidden flex items-center gap-1.5 px-4 py-2.5 border-b text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> All conversations
            </button>
            <ConversationView threadId={activeThread} currentUserId={currentUserId} />
          </div>
        ) : (
          <div className="hidden sm:flex flex-1 items-center justify-center text-center px-8">
            <div>
              <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Select a conversation to read messages</p>
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
