"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Bot,
  User,
  Sparkles,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  Square,
  Plus,
  MessageSquare,
  ChevronsLeft,
  ChevronsRight,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Download,
  RotateCcw,
  Calendar,
  Cloud,
  Layers,
  Headphones,
  Bell,
  HelpCircle,
  Paperclip,
  CheckCircle2,
  CalendarPlus,
  ExternalLink,
  Search,
  X,
  FileText,
  AlertCircle,
  Info,
  Clock,
  Phone,
  Mail,
} from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  model?: string;
  provider?: string;
  isStreaming?: boolean;
}

interface IntakeState {
  name: string | null;
  phone: string | null;
  email: string | null;
  purpose: string | null;
  appointment: string | null;
  confirmed: boolean;
  step: number; // 1 to 4
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
}

const INITIAL_WELCOME_TEXT =
  "👋 **Welcome to Convo Desk!**\n\n" +
  "I'm your dedicated customer concierge. Whether you're exploring our solutions, requesting a live product demo, or planning a technical consultation, I'm here to assist and reserve your priority appointment with our specialist team.\n\n" +
  "To get started, may I please have your **full name** and the **purpose of your enquiry** today?";

const QUICK_INQUIRIES = [
  {
    icon: Calendar,
    iconBg: "bg-purple-100 text-purple-600",
    text: "Hi, I'm Sarah Jenkins. I want to schedule a product demo for my team.",
  },
  {
    icon: Cloud,
    iconBg: "bg-sky-100 text-sky-600",
    text: "Hello, my name is David Miller. I need a technical consultation on cloud migration.",
  },
  {
    icon: Layers,
    iconBg: "bg-indigo-100 text-indigo-600",
    text: "Hi, I am Emily Zhang. I'd like to inquire about enterprise pricing & contracts.",
  },
  {
    icon: Headphones,
    iconBg: "bg-pink-100 text-pink-600",
    text: "Hello! I am Mark Davis and I want to book a support consultation.",
  },
];

const QUICK_TIME_SLOTS = [
  "Tomorrow at 10:00 AM",
  "Tomorrow at 2:30 PM",
  "Friday at 11:00 AM",
  "Next Monday at 3:00 PM",
];

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>("");
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"online" | "offline">("online");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Search in past conversations
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Modals & Popovers
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);

  // Attached file
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: string; content: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio / Speech State
  const [isRecording, setIsRecording] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRecognitionRef = useRef<any>(null);

  const createFreshSession = (): ChatSession => ({
    id: "session-" + Date.now(),
    title: "New Customer Enquiry",
    createdAt: "2026-01-01T00:00:00.000Z",
    messages: [
      {
        id: "welcome-msg",
        role: "assistant",
        content: INITIAL_WELCOME_TEXT,
        timestamp: "Just now",
        isStreaming: false,
      },
    ],
  });

  // Load sessions from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("convo_desk_light_sessions");
      if (saved) {
        const parsed: ChatSession[] = JSON.parse(saved);
        if (parsed.length > 0) {
          setSessions(parsed);
          setActiveSessionId(parsed[0].id);
          return;
        }
      }
    } catch (e) {
      console.warn("Storage load error:", e);
    }
    const fresh = createFreshSession();
    setSessions([fresh]);
    setActiveSessionId(fresh.id);
  }, []);

  // Save sessions to localStorage
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem("convo_desk_light_sessions", JSON.stringify(sessions));
    }
  }, [sessions]);

  const currentSession = sessions.find((s) => s.id === activeSessionId) || {
    id: "temp",
    title: "New Customer Enquiry",
    createdAt: "2026-01-01T00:00:00.000Z",
    messages: [
      {
        id: "welcome-msg-temp",
        role: "assistant",
        content: INITIAL_WELCOME_TEXT,
        timestamp: "Just now",
        isStreaming: false,
      },
    ],
  };

  const messages = currentSession.messages;

  // Compute Intake Progress
  const computeIntakeProgress = (): IntakeState => {
    const textAll = messages.map((m) => m.content).join(" ");
    const userMsgs = messages.filter((m) => m.role === "user");

    const emailMatch = textAll.match(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/);
    const phoneMatch = textAll.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    const confirmed = textAll.includes("✅") || textAll.toLowerCase().includes("confirmed") || textAll.includes("CNV-");

    let detectedName: string | null = null;
    let detectedPurpose: string | null = null;

    if (userMsgs.length > 0) {
      const first = userMsgs[0].content;
      if (first.toLowerCase().includes("my name is ")) {
        detectedName = first.split(/my name is /i)[1].split(".")[0].split(",")[0].trim();
      } else if (first.toLowerCase().includes("i am ")) {
        detectedName = first.split(/i am /i)[1].split(".")[0].split(",")[0].trim();
      } else if (first.toLowerCase().includes("i'm ")) {
        detectedName = first.split(/i'm /i)[1].split(".")[0].split(",")[0].trim();
      }
      detectedPurpose = first;
    }

    let appointmentTime: string | null = null;
    if (userMsgs.length >= 2) {
      const lastMsg = userMsgs[userMsgs.length - 1].content;
      if (/(am|pm|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|at\s)/i.test(lastMsg)) {
        appointmentTime = lastMsg;
      }
    }

    let step = 1;
    if (confirmed) step = 4;
    else if (emailMatch && phoneMatch) step = 3;
    else if (userMsgs.length > 0) step = 2;

    return {
      name: detectedName,
      phone: phoneMatch ? phoneMatch[0] : null,
      email: emailMatch ? emailMatch[0] : null,
      purpose: detectedPurpose,
      appointment: appointmentTime,
      confirmed: confirmed,
      step: step,
    };
  };

  const intakeState = computeIntakeProgress();

  // Check backend health
  useEffect(() => {
    checkBackendHealth();
  }, []);

  const checkBackendHealth = async () => {
    try {
      const res = await fetch("http://localhost:8000/");
      if (res.ok) {
        setBackendStatus("online");
      } else {
        setBackendStatus("offline");
      }
    } catch {
      setBackendStatus("offline");
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const updateCurrentSessionMessages = (newMessages: Message[] | ((prev: Message[]) => Message[])) => {
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id === activeSessionId) {
          const updated = typeof newMessages === "function" ? newMessages(session.messages) : newMessages;
          let title = session.title;
          if (title === "New Customer Enquiry" && updated.length > 1) {
            const firstUserMsg = updated.find((m) => m.role === "user");
            if (firstUserMsg) {
              title = firstUserMsg.content.slice(0, 24) + (firstUserMsg.content.length > 24 ? "..." : "");
            }
          }
          return { ...session, messages: updated, title };
        }
        return session;
      })
    );
  };

  const createNewSession = () => {
    if (isGenerating) handleStop();
    const fresh = createFreshSession();
    setSessions((prev) => [fresh, ...prev]);
    setActiveSessionId(fresh.id);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isGenerating && activeSessionId === id) handleStop();
    const remaining = sessions.filter((s) => s.id !== id);
    if (remaining.length === 0) {
      const fresh = createFreshSession();
      setSessions([fresh]);
      setActiveSessionId(fresh.id);
    } else {
      setSessions(remaining);
      if (activeSessionId === id) {
        setActiveSessionId(remaining[0].id);
      }
    }
  };

  const clearAllSessions = () => {
    if (isGenerating) handleStop();
    const fresh = createFreshSession();
    setSessions([fresh]);
    setActiveSessionId(fresh.id);
    localStorage.removeItem("convo_desk_light_sessions");
    setShowProfileMenu(false);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      updateCurrentSessionMessages((prev) =>
        prev.map((msg) => (msg.isStreaming ? { ...msg, isStreaming: false } : msg))
      );
    }
  };

  // File Upload Handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeStr = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(file.size / 1024)} KB`;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string || "";
      setAttachedFile({
        name: file.name,
        size: sizeStr,
        content: content.slice(0, 5000), // cap preview to 5KB for prompt
      });
    };
    reader.readAsText(file);
    // Reset file input value
    e.target.value = "";
  };

  // Text to Speech
  const toggleSpeech = (text: string, messageId: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Text-to-speech is not supported by your browser.");
      return;
    }
    if (speakingMessageId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/```[\s\S]*?```/g, "Code omitted.").replace(/\|/g, " ");
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.05;
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    setSpeakingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
  };

  // Speech to Text
  const toggleRecording = () => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.");
      return;
    }
    if (isRecording) {
      if (speechRecognitionRef.current) speechRecognitionRef.current.stop();
      setIsRecording(false);
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        setInput(transcript);
      };
      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);
      speechRecognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Speech recognition error:", err);
      setIsRecording(false);
    }
  };

  // Export Transcript
  const exportChat = () => {
    if (messages.length === 0) return;
    const content = messages
      .map((m) => `### ${m.role === "user" ? "Customer" : "Convo Desk"} (${m.timestamp})\n\n${m.content}\n\n---\n`)
      .join("\n");
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ConvoDesk_Intake_${currentSession.id}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Generate Google Calendar Link
  const createGoogleCalendarLink = (timeStr: string, name: string) => {
    const title = encodeURIComponent(`Consultation: ${name || "Customer"}`);
    const details = encodeURIComponent("Customer intake & consultation scheduled via Convo Desk.");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}`;
  };

  // Send message
  const handleSend = async (customPrompt?: string, overrideHistory?: Message[]) => {
    let textToSend = (customPrompt || input).trim();
    if (!textToSend && !attachedFile) return;
    if (isGenerating) return;

    if (attachedFile) {
      textToSend += `\n\n[Attached File: ${attachedFile.name} (${attachedFile.size})]\n${attachedFile.content}`;
      setAttachedFile(null);
    }

    setInput("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    const userMessageId = "msg-" + Date.now();
    const assistantMessageId = "msg-" + (Date.now() + 1);

    const userMessage: Message = {
      id: userMessageId,
      role: "user",
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const baseHistory = overrideHistory || messages;
    const newMessages = [...baseHistory, userMessage];
    updateCurrentSessionMessages(newMessages);

    const assistantPlaceholder: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: "Just now",
      isStreaming: true,
    };

    updateCurrentSessionMessages([...newMessages, assistantPlaceholder]);
    setIsGenerating(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch("http://localhost:8000/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: abortController.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const rawData = line.replace("data: ", "").trim();
            if (!rawData) continue;

            try {
              const parsed = JSON.parse(rawData);
              if (parsed.chunk) {
                accumulatedText += parsed.chunk;
                updateCurrentSessionMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: accumulatedText }
                      : msg
                  )
                );
              }
              if (parsed.done) {
                updateCurrentSessionMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          content: accumulatedText,
                          isStreaming: false,
                        }
                      : msg
                  )
                );
              }
            } catch (err) {
              console.error("SSE parse error:", err);
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        console.log("Stream stopped");
      } else {
        console.error("Chat error:", err);
        updateCurrentSessionMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content:
                    msg.content +
                    `\n\n⚠️ *Connection Error: Could not reach backend server at http://localhost:8000.*`,
                  isStreaming: false,
                }
              : msg
          )
        );
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Filtered Sessions for Search
  const filteredSessions = sessions.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Modern Card Rendering for Confirmation
  const renderMessageContent = (content: string, id: string) => {
    // Check if it's the confirmation card
    if (content.includes("| :--- |") || content.includes("| Field |")) {
      const lines = content.split("\n");
      const rows: { label: string; value: string }[] = [];
      const introText: string[] = [];
      const outroText: string[] = [];
      let inTable = false;

      lines.forEach((line) => {
        if (line.trim().startsWith("|")) {
          inTable = true;
          if (!line.includes(":---") && !line.toLowerCase().includes("| field |")) {
            const parts = line.split("|").slice(1, -1).map((s) => s.trim().replace(/\*\*/g, ""));
            if (parts.length >= 2) {
              rows.push({ label: parts[0], value: parts[1] });
            }
          }
        } else {
          if (!inTable) introText.push(line);
          else outroText.push(line);
        }
      });

      const appointmentVal = rows.find((r) => r.label.toLowerCase().includes("date"))?.value || "Scheduled Date";
      const nameVal = rows.find((r) => r.label.toLowerCase().includes("name"))?.value || "Customer";

      return (
        <div className="space-y-4">
          {introText.length > 0 && (
            <div className="text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">
              {introText.join("\n")}
            </div>
          )}

          {/* Clean Light-Mode Appointment Card */}
          <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-emerald-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 tracking-tight">Appointment Confirmed</h4>
                  <p className="text-[11px] text-slate-500">Official Scheduling Receipt</p>
                </div>
              </div>
              <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                Confirmed
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {rows.map((row, idx) => (
                <div key={idx} className="bg-white border border-slate-200/70 rounded-xl p-2.5 shadow-2xs">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-0.5">
                    {row.label}
                  </div>
                  <div className="text-slate-800 font-semibold text-xs break-words">
                    {row.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-1 flex flex-wrap gap-2">
              <a
                href={createGoogleCalendarLink(appointmentVal, nameVal)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-medium transition-all shadow-sm"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                <span>Add to Google Calendar</span>
                <ExternalLink className="w-3 h-3 opacity-80" />
              </a>

              <button
                onClick={exportChat}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Download Receipt</span>
              </button>
            </div>
          </div>

          {outroText.length > 0 && (
            <div className="text-xs text-slate-500 italic whitespace-pre-wrap leading-relaxed">
              {outroText.join("\n")}
            </div>
          )}
        </div>
      );
    }

    // Standard markdown rendering
    const renderedLines = content.split("\n").map((line, lIdx) => {
      if (line.includes("Welcome to Convo Desk!") || line.includes("Hello and welcome!")) {
        return (
          <div key={lIdx} className="text-indigo-600 font-bold text-lg mb-2 flex items-center gap-1.5">
            <span>👋</span>
            <span>Welcome to Convo Desk!</span>
          </div>
        );
      }

      const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("* ");
      const formatted = line.replace(/(\*\*|__)(.*?)\1/g, "<strong class='font-bold text-slate-900'>$2</strong>");

      return (
        <span
          key={lIdx}
          className={`block ${isBullet ? "pl-4 before:content-['•'] before:inline-block before:w-3 before:-ml-4 before:text-indigo-500" : ""}`}
          dangerouslySetInnerHTML={{ __html: formatted || "&nbsp;" }}
        />
      );
    });

    return <div className="space-y-1.5 leading-relaxed text-slate-700 text-sm">{renderedLines}</div>;
  };

  return (
    <div className="flex h-screen bg-[#f8f9fe] text-slate-800 font-sans antialiased overflow-hidden selection:bg-purple-500 selection:text-white">
      {/* Hidden File Input for Paperclip */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".txt,.pdf,.doc,.docx,.json,.csv,.md,.py,.js"
      />

      {/* Sidebar (Left) */}
      <aside
        className={`${
          sidebarOpen ? "w-64 sm:w-72" : "w-0"
        } transition-all duration-300 ease-in-out border-r border-slate-200/80 bg-white flex flex-col shrink-0 overflow-hidden relative z-30`}
      >
        {/* Sidebar Brand Header */}
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
              <Bot className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="font-bold text-sm tracking-tight text-slate-900">Convo Desk</h2>
              <p className="text-[11px] text-slate-400 font-normal">AI Customer Assistant</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            title="Collapse sidebar"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
        </div>

        {/* New Customer Chat Button */}
        <div className="px-4 pb-3">
          <button
            onClick={createNewSession}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-[#6366f1] via-[#7c3aed] to-[#8b5cf6] hover:opacity-95 text-white text-xs font-semibold py-3 px-4 rounded-2xl shadow-md shadow-indigo-500/20 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Customer Chat</span>
          </button>
        </div>

        {/* Intake Workflow Stepper */}
        <div className="px-4 py-3 mx-3 my-1 rounded-2xl border border-slate-100 bg-[#fafbff]">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-800 mb-2.5">
            <span>Intake Workflow</span>
            <span className="text-[11px] text-slate-400 font-medium">
              Step {intakeState.step} of 4
            </span>
          </div>

          {/* Stepper with Circles & Connecting Line */}
          <div className="relative flex items-center justify-between px-2 mb-2">
            <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 z-0" />
            
            {/* Step 1 */}
            <div
              className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                intakeState.step >= 1
                  ? "bg-[#6366f1] text-white ring-2 ring-indigo-100"
                  : "bg-white border-2 border-slate-300 text-slate-400"
              }`}
            >
              <Check className="w-3 h-3 stroke-[3]" />
            </div>

            {/* Step 2 */}
            <div
              className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                intakeState.step >= 2
                  ? "bg-[#6366f1] text-white ring-2 ring-indigo-100"
                  : "bg-white border-2 border-slate-300 text-slate-400"
              }`}
            >
              {intakeState.step >= 2 ? <Check className="w-3 h-3 stroke-[3]" /> : ""}
            </div>

            {/* Step 3 */}
            <div
              className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                intakeState.step >= 3
                  ? "bg-[#6366f1] text-white ring-2 ring-indigo-100"
                  : "bg-white border-2 border-slate-300 text-slate-400"
              }`}
            >
              {intakeState.step >= 3 ? <Check className="w-3 h-3 stroke-[3]" /> : ""}
            </div>

            {/* Step 4 */}
            <div
              className={`relative z-10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                intakeState.step >= 4
                  ? "bg-emerald-500 text-white ring-2 ring-emerald-100"
                  : "bg-white border-2 border-slate-300 text-slate-400"
              }`}
            >
              {intakeState.step >= 4 ? <Check className="w-3 h-3 stroke-[3]" /> : ""}
            </div>
          </div>

          <div className="grid grid-cols-4 text-center text-[10px] font-medium text-slate-400">
            <span className={intakeState.step >= 1 ? "text-indigo-600 font-semibold" : ""}>Welcome</span>
            <span className={intakeState.step >= 2 ? "text-indigo-600 font-semibold" : ""}>Details</span>
            <span className={intakeState.step >= 3 ? "text-indigo-600 font-semibold" : ""}>Schedule</span>
            <span className={intakeState.step >= 4 ? "text-emerald-600 font-semibold" : ""}>Confirmed</span>
          </div>
        </div>

        {/* Past Conversations List */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-800 py-1.5">
            <span>Past Conversations</span>
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                searchOpen
                  ? "bg-indigo-50 border-indigo-300 text-indigo-600"
                  : "border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50"
              }`}
              title="Search past chats"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Interactive Search Bar */}
          {searchOpen && (
            <div className="mb-2 relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by title..."
                className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {filteredSessions.map((session) => (
            <div
              key={session.id}
              onClick={() => {
                if (isGenerating) handleStop();
                setActiveSessionId(session.id);
              }}
              className={`group flex items-center justify-between p-2.5 rounded-2xl text-xs cursor-pointer transition-all ${
                session.id === activeSessionId
                  ? "bg-[#ede9fe] text-slate-900 font-medium"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2.5 truncate mr-1">
                <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center text-white shrink-0">
                  <MessageSquare className="w-3.5 h-3.5" />
                </div>
                <span className="truncate">{session.title}</span>
              </div>
              <button
                onClick={(e) => deleteSession(session.id, e)}
                className="opacity-0 group-hover:opacity-100 hover:text-rose-500 p-1 rounded-md transition-opacity cursor-pointer"
                title="Delete session"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {filteredSessions.length === 0 && (
            <div className="text-center py-4 text-xs text-slate-400">
              No conversations found.
            </div>
          )}
        </div>

        {/* Decorative Wave at the bottom of the sidebar */}
        <div className="relative w-full h-14 pointer-events-none overflow-hidden shrink-0">
          <svg
            viewBox="0 0 500 150"
            preserveAspectRatio="none"
            className="w-full h-full opacity-35"
          >
            <path
              d="M0.00,49.98 C149.99,150.00 349.81,-49.98 500.00,49.98 L500.00,150.00 L0.00,150.00 Z"
              fill="url(#purpleWave)"
            />
            <defs>
              <linearGradient id="purpleWave" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* User Profile & Export Footer */}
        <div className="p-3.5 border-t border-slate-100 bg-white flex items-center justify-between relative">
          <div
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            title="Account Options"
          >
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-semibold flex items-center justify-center text-xs shadow-2xs">
              N
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 leading-tight">Gollu DurgaPrasad</div>
              <div className="text-[10px] text-slate-400">Admin</div>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </div>

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className="absolute bottom-16 left-3 w-56 rounded-2xl bg-white border border-slate-200 shadow-xl p-2 z-50 text-xs space-y-1">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Admin Controls
              </div>
              <button
                onClick={clearAllSessions}
                className="w-full text-left px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All Chat History</span>
              </button>
              <button
                onClick={exportChat}
                className="w-full text-left px-3 py-2 rounded-xl text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Export Current Transcript</span>
              </button>
            </div>
          )}

          <button
            onClick={exportChat}
            disabled={messages.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export</span>
          </button>
        </div>
      </aside>

      {/* Main Chat Interface */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f8f9fe]">
        {/* Top Navbar */}
        <header className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200/80 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                title="Expand sidebar"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            )}

            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white shadow-sm">
              <MessageSquare className="w-5 h-5 fill-current" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm sm:text-base tracking-tight text-slate-900">
                  Convo Desk
                </h1>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Assistant
                </span>
              </div>
              <div
                onClick={() => setShowStatusModal(!showStatusModal)}
                className="flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer hover:text-slate-800 transition-colors"
                title="View Server Status"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    backendStatus === "online" ? "bg-emerald-500" : "bg-rose-500"
                  }`}
                />
                <span className="capitalize">{backendStatus}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Right Header Icons */}
          <div className="flex items-center gap-3 relative">
            {/* Notification Bell */}
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-purple-600 ring-2 ring-white" />
            </button>

            {/* Notification Popover */}
            {showNotifications && (
              <div className="absolute top-12 right-12 w-72 rounded-2xl bg-white border border-slate-200 shadow-xl p-3 z-50 text-xs space-y-2">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="font-bold text-slate-800">Notifications</span>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="p-2 rounded-xl bg-purple-50 text-purple-800 flex items-start gap-2">
                  <Clock className="w-4 h-4 shrink-0 mt-0.5 text-purple-600" />
                  <div>
                    <div className="font-semibold text-xs">Automated Confirmation Active</div>
                    <div className="text-[11px] text-purple-600/90 mt-0.5">
                      Bookings generate verified reference codes and calendar invites.
                    </div>
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-slate-50 text-slate-700 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                  <div>
                    <div className="font-semibold text-xs">SQLite Database Connected</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      All appointments are persisted to backend storage.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Help (?) Button */}
            <button
              onClick={() => setShowHelpModal(true)}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
              title="Help & Information"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* Profile Avatar */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#6366f1] to-[#8b5cf6] text-white font-semibold flex items-center justify-center text-xs shadow-2xs">
              G
            </div>
          </div>
        </header>

        {/* Server Status Modal */}
        {showStatusModal && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-200 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${backendStatus === "online" ? "bg-emerald-500" : "bg-rose-500"}`} />
                  <h3 className="font-bold text-sm text-slate-900">Backend Server Status</h3>
                </div>
                <button onClick={() => setShowStatusModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex justify-between p-2 rounded-xl bg-slate-50">
                  <span>API Endpoint:</span>
                  <span className="font-mono text-indigo-600 font-semibold">http://localhost:8000</span>
                </div>
                <div className="flex justify-between p-2 rounded-xl bg-slate-50">
                  <span>Connection:</span>
                  <span className={backendStatus === "online" ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>
                    {backendStatus.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between p-2 rounded-xl bg-slate-50">
                  <span>Database:</span>
                  <span className="text-indigo-600 font-semibold">SQLite (appointments.db)</span>
                </div>
              </div>

              <button
                onClick={() => {
                  checkBackendHealth();
                  setShowStatusModal(false);
                }}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Ping Server Again
              </button>
            </div>
          </div>
        )}

        {/* Help & Workflow Information Modal */}
        {showHelpModal && (
          <div className="fixed inset-0 bg-black/25 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Info className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">How Convo Desk Works</h3>
                    <p className="text-[11px] text-slate-400">Customer Intake & Scheduling</p>
                  </div>
                </div>
                <button onClick={() => setShowHelpModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-xs text-slate-600">
                <div className="p-3 rounded-2xl bg-indigo-50/60 border border-indigo-100 space-y-1.5">
                  <div className="font-bold text-indigo-900">The 6-Step Workflow:</div>
                  <div className="space-y-1 text-[11px] text-indigo-800">
                    <div>• <strong>1. Welcome Greeting:</strong> Friendly greeting upon opening chat.</div>
                    <div>• <strong>2. Data Collection:</strong> Collects Name, Phone, Email & Purpose.</div>
                    <div>• <strong>3. Contextual Follow-up:</strong> Inquires specifically into your needs.</div>
                    <div>• <strong>4. Scheduling:</strong> Selects preferred appointment date & time.</div>
                    <div>• <strong>5. Confirmation:</strong> Generates booking receipt with calendar link.</div>
                    <div>• <strong>6. Error Handling:</strong> Validates contact info and clarifies details.</div>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 text-[11px] text-slate-500 space-y-1">
                  <div><strong>Voice Dictation:</strong> Click the microphone icon to dictate via browser speech recognition.</div>
                  <div><strong>Calendar Sync:</strong> Click &quot;Add to Google Calendar&quot; on the confirmation receipt to save the event.</div>
                </div>
              </div>

              <button
                onClick={() => setShowHelpModal(false)}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        )}

        {/* Conversation Stream */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Quick Suggestion Cards Grid (When conversation begins) */}
            {messages.length === 1 && (
              <div className="space-y-3 pt-1">
                <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-600 fill-current" />
                  <span>Tap on an example enquiry to begin:</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {QUICK_INQUIRIES.map((item, idx) => {
                    const IconComponent = item.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSend(item.text)}
                        className="text-left p-3.5 rounded-2xl bg-white border border-slate-200/70 hover:border-purple-300 hover:shadow-md transition-all flex items-start gap-3 shadow-2xs group cursor-pointer"
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${item.iconBg}`}>
                          <IconComponent className="w-4 h-4" />
                        </div>
                        <span className="text-xs text-slate-700 leading-snug font-normal group-hover:text-slate-900">
                          {item.text}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Time Slot Chips (when assistant is asking for date and time) */}
            {intakeState.step === 3 && !intakeState.confirmed && (
              <div className="p-4 rounded-2xl bg-white border border-purple-200 shadow-sm space-y-2.5">
                <div className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span>Select preferred appointment time slot:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TIME_SLOTS.map((slot, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(slot)}
                      className="text-xs px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 text-indigo-700 border border-indigo-200/60 font-medium transition-colors shadow-2xs cursor-pointer"
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 sm:gap-3.5 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
                    <Bot className="w-5 h-5" />
                  </div>
                )}

                <div
                  className={`flex flex-col space-y-1.5 max-w-[85%] sm:max-w-[82%] ${
                    message.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div className="flex items-center gap-2 px-1 text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-700">
                      {message.role === "user" ? "You" : "Convo Desk"}
                    </span>
                    <span>•</span>
                    <span>{message.timestamp}</span>
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`rounded-3xl p-5 shadow-sm transition-all ${
                      message.role === "user"
                        ? "bg-gradient-to-r from-[#6366f1] via-[#7c3aed] to-[#8b5cf6] text-white rounded-tr-md shadow-md shadow-indigo-500/10 font-normal text-sm leading-relaxed"
                        : "bg-gradient-to-r from-[#eff2fe] to-[#f6f2fe] border border-slate-200/50 text-slate-800 rounded-tl-md w-full relative overflow-hidden"
                    }`}
                  >
                    {/* Decorative subtle wave curve in the bottom corner of assistant bubble */}
                    {message.role === "assistant" && (
                      <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-purple-200/40 pointer-events-none blur-xl" />
                    )}

                    {message.content ? (
                      renderMessageContent(message.content, message.id)
                    ) : message.isStreaming ? (
                      <div className="flex items-center gap-1.5 py-1">
                        <span className="w-2 h-2 rounded-full bg-purple-600 animate-bounce" />
                        <span className="w-2 h-2 rounded-full bg-purple-600 animate-bounce [animation-delay:0.2s]" />
                        <span className="w-2 h-2 rounded-full bg-purple-600 animate-bounce [animation-delay:0.4s]" />
                      </div>
                    ) : null}

                    {message.isStreaming && message.content && (
                      <span className="inline-block w-2 h-4 ml-1 bg-purple-600 animate-pulse align-middle" />
                    )}
                  </div>

                  {/* Action buttons under assistant message */}
                  {message.role === "assistant" && message.content && !message.isStreaming && (
                    <div className="flex items-center gap-2 pt-1 px-1 text-xs text-slate-500">
                      <button
                        onClick={() => handleCopy(message.content, message.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs transition-colors shadow-2xs cursor-pointer"
                        title="Copy text"
                      >
                        {copiedId === message.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-emerald-600 font-medium text-xs">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-500" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => toggleSpeech(message.content, message.id)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs transition-colors shadow-2xs cursor-pointer ${
                          speakingMessageId === message.id ? "text-purple-600 border-purple-300" : ""
                        }`}
                        title="Listen to audio"
                      >
                        {speakingMessageId === message.id ? (
                          <>
                            <VolumeX className="w-3.5 h-3.5 text-purple-600 animate-pulse" />
                            <span className="text-purple-600 font-medium text-xs">Stop</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5 text-slate-500" />
                            <span>Listen</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {message.role === "user" && (
                  <div className="w-10 h-10 rounded-2xl bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 shrink-0 mt-0.5 shadow-2xs">
                    <User className="w-5 h-5" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input Composer Footer (Capsule floating bar) */}
        <footer className="px-4 sm:px-8 pb-4 pt-2 bg-transparent">
          <div className="max-w-3xl mx-auto space-y-2">
            {/* Attached File Preview Badge */}
            {attachedFile && (
              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-100 text-purple-800 text-xs w-fit border border-purple-200 shadow-xs">
                <Paperclip className="w-3.5 h-3.5 text-purple-600" />
                <span className="font-semibold">{attachedFile.name}</span>
                <span className="text-purple-600/70">({attachedFile.size})</span>
                <button
                  onClick={() => setAttachedFile(null)}
                  className="hover:text-purple-950 ml-1 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="relative flex items-center gap-2 bg-white border border-slate-200/90 rounded-full px-4 py-2 shadow-lg shadow-purple-500/5 focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-200 transition-all">
              <Sparkles className="w-5 h-5 text-purple-600 shrink-0 fill-current" />

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type your name, contact info, enquiry, or preferred date & time..."
                rows={1}
                className="flex-1 bg-transparent border-0 resize-none px-2 py-1.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none max-h-32"
              />

              <div className="flex items-center gap-1.5 shrink-0">
                {/* File Attachment Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                  title="Attach document or text file"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                {/* Voice Dictation (Microphone) */}
                <button
                  type="button"
                  onClick={toggleRecording}
                  className={`p-2 rounded-full transition-all cursor-pointer ${
                    isRecording
                      ? "bg-rose-500 text-white animate-pulse"
                      : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  }`}
                  title={isRecording ? "Stop dictation" : "Dictate via microphone"}
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                {isGenerating ? (
                  <button
                    onClick={handleStop}
                    className="w-9 h-9 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center transition-all shadow-md shrink-0 cursor-pointer"
                    title="Stop generation"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                ) : (
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() && !attachedFile}
                    className="w-9 h-9 rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 disabled:opacity-40 text-white flex items-center justify-center transition-all shadow-md shadow-indigo-500/20 shrink-0 disabled:cursor-not-allowed cursor-pointer"
                    title="Send message"
                  >
                    <Send className="w-4 h-4 -translate-y-px translate-x-px" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-3 text-[11px] text-slate-400">
              <span>
                Flow: Welcome → Contextual Intake → Scheduling → Confirmation
              </span>
              <span className="flex items-center gap-1.5 text-slate-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Real-time Assistant
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
