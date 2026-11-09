"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Bot,
  User,
  Sparkles,
  Settings,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  ChevronDown,
  Square,
  AlertCircle,
  Plus,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Download,
  RotateCcw,
  Calendar,
  CheckCircle2,
  Clock,
  Phone,
  Mail,
  FileText,
  CalendarPlus,
  ExternalLink,
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
  model: string;
}

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  is_available: boolean;
  description?: string;
}

const DEFAULT_MODELS: ModelInfo[] = [
  {
    id: "mock-intake-v1",
    name: "Convo Intake Bot (Mock)",
    provider: "mock",
    is_available: true,
    description: "Built-in intake & appointment state machine (no API key required).",
  },
  {
    id: "mistral-small-latest",
    name: "Mistral Small 3",
    provider: "mistral",
    is_available: false,
    description: "Fast, high-efficiency Mistral AI reasoning model.",
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "gemini",
    is_available: false,
    description: "Google Gemini configured with 6-step customer intake instructions.",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    is_available: false,
    description: "OpenAI GPT-4o Mini configured with 6-step customer intake instructions.",
  },
];

const INITIAL_WELCOME_TEXT =
  "👋 **Hello and welcome!**\n\n" +
  "I'm **Convo Desk**, your virtual customer service and scheduling assistant.\n\n" +
  "To get started and schedule an appointment with our specialist, may I have your **full name** and the **purpose of your enquiry** today?";

const QUICK_INQUIRIES = [
  "Hi, I'm Sarah Jenkins. I want to schedule a product demo for my team.",
  "Hello, my name is David Miller. I need a technical consultation on cloud migration.",
  "Hi, I am Emily Zhang. I'd like to inquire about enterprise pricing & contracts.",
  "Hello! I am Mark Davis and I want to book a support consultation.",
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
  const [activeModel, setActiveModel] = useState("mock-intake-v1");
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>(DEFAULT_MODELS);
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [temperature, setTemperature] = useState(0.7);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
    model: activeModel,
    messages: [
      {
        id: "welcome-msg",
        role: "assistant",
        content: INITIAL_WELCOME_TEXT,
        timestamp: "Just now",
        model: activeModel,
        provider: "intake-bot",
        isStreaming: false,
      },
    ],
  });

  // Load sessions from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("convo_desk_sessions");
      if (saved) {
        const parsed: ChatSession[] = JSON.parse(saved);
        if (parsed.length > 0) {
          setSessions(parsed);
          setActiveSessionId(parsed[0].id);
          setActiveModel(parsed[0].model || "mock-intake-v1");
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
      localStorage.setItem("convo_desk_sessions", JSON.stringify(sessions));
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
        model: activeModel,
        provider: "intake-bot",
        isStreaming: false,
      },
    ],
    model: activeModel,
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
    if (userMsgs.length >= 3) {
      appointmentTime = userMsgs[userMsgs.length - 1].content;
    }

    let step = 1;
    if (confirmed) step = 4;
    else if (emailMatch || phoneMatch) step = 3;
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
    setBackendStatus("checking");
    try {
      const res = await fetch("http://localhost:8000/");
      if (res.ok) {
        setBackendStatus("online");
        fetchModels();
      } else {
        setBackendStatus("offline");
      }
    } catch {
      setBackendStatus("offline");
    }
  };

  const fetchModels = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/models");
      if (res.ok) {
        const data = await res.json();
        setAvailableModels(data);
      }
    } catch (e) {
      console.warn("Could not fetch models:", e);
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
              title = firstUserMsg.content.slice(0, 26) + (firstUserMsg.content.length > 26 ? "..." : "");
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

  const resetConversation = () => {
    if (isGenerating) handleStop();
    updateCurrentSessionMessages([
      {
        id: "welcome-reset-" + Date.now(),
        role: "assistant",
        content: INITIAL_WELCOME_TEXT,
        timestamp: "Just now",
        model: activeModel,
        provider: "intake-bot",
        isStreaming: false,
      },
    ]);
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
    const utterance = new SpeechSynthesisUtterance(text.replace(/```[\s\S]*?```/g, "Code omitted.").replace(/\|/g, " "));
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

  // Export Confirmation
  const exportChat = () => {
    if (messages.length === 0) return;
    const content = messages
      .map((m) => `### ${m.role === "user" ? "Customer" : "Convo Desk"} (${m.timestamp})\n\n${m.content}\n\n---\n`)
      .join("\n");
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Intake_Confirmation_${currentSession.id}.md`;
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
    const textToSend = (customPrompt || input).trim();
    if (!textToSend || isGenerating) return;

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

    const selectedModelObj = availableModels.find((m) => m.id === activeModel);
    const provider = selectedModelObj?.provider || "mock";

    const assistantPlaceholder: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      model: activeModel,
      provider: provider,
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
          provider: provider,
          model: activeModel,
          temperature: temperature,
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
                          model: parsed.model || msg.model,
                          provider: parsed.provider || msg.provider,
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
            <div className="text-slate-200 leading-relaxed whitespace-pre-wrap font-medium">
              {introText.join("\n")}
            </div>
          )}

          {/* Sleek Appointment Card */}
          <div className="overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-slate-900 via-slate-900 to-emerald-950/20 shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white tracking-tight">Appointment Confirmed</h4>
                  <p className="text-[11px] text-slate-400">Official Scheduling Receipt</p>
                </div>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                Confirmed
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {rows.map((row, idx) => (
                <div key={idx} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-2.5">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-medium mb-0.5">
                    {row.label}
                  </div>
                  <div className="text-white font-medium text-xs break-words">
                    {row.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex flex-wrap gap-2">
              <a
                href={createGoogleCalendarLink(appointmentVal, nameVal)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shadow-sm"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                <span>Add to Google Calendar</span>
                <ExternalLink className="w-3 h-3 opacity-70" />
              </a>

              <button
                onClick={exportChat}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Receipt</span>
              </button>
            </div>
          </div>

          {outroText.length > 0 && (
            <div className="text-xs text-slate-400 italic whitespace-pre-wrap leading-relaxed">
              {outroText.join("\n")}
            </div>
          )}
        </div>
      );
    }

    // Standard markdown rendering
    const renderedLines = content.split("\n").map((line, lIdx) => {
      const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("* ");
      const formatted = line.replace(/(\*\*|__)(.*?)\1/g, "<strong class='font-semibold text-white'>$2</strong>");

      return (
        <span
          key={lIdx}
          className={`block ${isBullet ? "pl-4 before:content-['•'] before:inline-block before:w-3 before:-ml-4 before:text-indigo-400" : ""}`}
          dangerouslySetInnerHTML={{ __html: formatted || "&nbsp;" }}
        />
      );
    });

    return <div className="space-y-1.5 leading-relaxed text-slate-200 text-sm">{renderedLines}</div>;
  };

  return (
    <div className="flex h-screen bg-[#0d0f15] text-slate-100 font-sans antialiased overflow-hidden selection:bg-indigo-600 selection:text-white">
      {/* Sleek Left Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-64 sm:w-72" : "w-0"
        } transition-all duration-300 ease-in-out border-r border-slate-800/80 bg-[#12151e] flex flex-col shrink-0 overflow-hidden relative z-30`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-800/80">
          <button
            onClick={createNewSession}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            <Plus className="w-4 h-4" />
            <span>New Customer Chat</span>
          </button>
        </div>

        {/* Minimalist Visual Progress Tracker */}
        <div className="px-4 py-3 border-b border-slate-800/60 bg-slate-900/40">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 mb-2">
            <span>Intake Workflow</span>
            <span className="text-[10px] text-indigo-400 font-mono">
              Step {intakeState.step} of 4
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex mb-2.5">
            <div
              className="h-full bg-indigo-500 transition-all duration-500 ease-out"
              style={{ width: `${(intakeState.step / 4) * 100}%` }}
            />
          </div>

          <div className="grid grid-cols-4 text-center text-[9px] font-medium text-slate-500">
            <span className={intakeState.step >= 1 ? "text-indigo-400" : ""}>Welcome</span>
            <span className={intakeState.step >= 2 ? "text-indigo-400" : ""}>Details</span>
            <span className={intakeState.step >= 3 ? "text-indigo-400" : ""}>Schedule</span>
            <span className={intakeState.step >= 4 ? "text-emerald-400" : ""}>Confirmed</span>
          </div>
        </div>

        {/* Recent Conversations List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-2 py-1.5">
            Past Conversations
          </div>
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => {
                if (isGenerating) handleStop();
                setActiveSessionId(session.id);
              }}
              className={`group flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition-all ${
                session.id === activeSessionId
                  ? "bg-slate-800 text-white font-medium shadow-sm"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
              }`}
            >
              <div className="flex items-center gap-2.5 truncate mr-1">
                <MessageSquare className="w-3.5 h-3.5 shrink-0 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                <span className="truncate">{session.title}</span>
              </div>
              <button
                onClick={(e) => deleteSession(session.id, e)}
                className="opacity-0 group-hover:opacity-100 hover:text-rose-400 p-1 rounded-md transition-opacity"
                title="Delete session"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3.5 border-t border-slate-800/80 bg-slate-900/30 text-[11px] text-slate-400 flex items-center justify-between">
          <span>{sessions.length} Chat{sessions.length > 1 ? "s" : ""}</span>
          <button
            onClick={exportChat}
            disabled={messages.length === 0}
            className="flex items-center gap-1.5 hover:text-slate-200 disabled:opacity-40 transition-colors"
            title="Download Transcript"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </aside>

      {/* Main Chat Interface */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0d0f15]">
        {/* Clean Modern Navbar */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-800/80 bg-[#12151e]/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
                <Calendar className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-semibold text-sm sm:text-base tracking-tight text-white">
                    Convo Desk
                  </h1>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Live Assistant
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        backendStatus === "online"
                          ? "bg-emerald-400"
                          : backendStatus === "checking"
                          ? "bg-amber-400"
                          : "bg-rose-500"
                      }`}
                    />
                    <span className="capitalize">{backendStatus}</span>
                  </span>
                  <span>•</span>
                  <button
                    onClick={checkBackendHealth}
                    className="hover:text-slate-200 transition-colors flex items-center gap-1"
                    title="Refresh backend status"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Model Selector & Actions */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={activeModel}
                onChange={(e) => setActiveModel(e.target.value)}
                className="appearance-none bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl pl-3 pr-8 py-2 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer hover:bg-slate-750 transition-colors"
              >
                {availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {!m.is_available && m.provider !== "mock" ? "(Needs Key)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-xl border transition-colors ${
                showSettings
                  ? "bg-indigo-600/20 border-indigo-500 text-indigo-300"
                  : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              }`}
              title="Settings"
            >
              <Sliders className="w-4 h-4" />
            </button>

            <button
              onClick={resetConversation}
              className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-rose-400 hover:border-rose-500/50 transition-colors"
              title="Reset conversation"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Settings Panel */}
        {showSettings && (
          <div className="border-b border-slate-800 bg-slate-900/95 px-6 py-4 transition-all">
            <div className="max-w-2xl mx-auto space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                  <Settings className="w-3.5 h-3.5 text-indigo-400" />
                  Bot Configuration
                </h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 text-xs text-slate-300 space-y-1.5">
                <div className="font-semibold text-emerald-400">Strict 6-Step Workflow:</div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-400">
                  <div>1. 👋 Customer Welcome Greeting</div>
                  <div>2. 👤 Name, Contact, Email & Purpose</div>
                  <div>3. 💬 Contextual Follow-up Questions</div>
                  <div>4. 📅 Preferred Date & Time</div>
                  <div>5. ✅ Structured Booking Confirmation</div>
                  <div>6. 🛡️ Robust Validation & Error Handling</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Conversation Stream */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* Quick Suggestion Chips (when only initial greeting is displayed) */}
            {messages.length === 1 && (
              <div className="space-y-2.5 pt-1">
                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Tap an example enquiry to begin:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {QUICK_INQUIRIES.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(prompt)}
                      className="text-left text-xs p-3 rounded-xl border border-slate-800/90 bg-[#161924] hover:bg-[#1c2030] hover:border-indigo-500/50 text-slate-200 transition-all shadow-sm"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Time Slot Chips (when assistant is asking for date and time) */}
            {intakeState.step === 3 && !intakeState.confirmed && (
              <div className="p-3 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 space-y-2">
                <div className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Quick Appointment Time Slots:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TIME_SLOTS.map((slot, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(slot)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors shadow-sm"
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
                className={`flex gap-3 sm:gap-4 ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shrink-0 mt-1 shadow-md shadow-indigo-600/10">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}

                <div
                  className={`flex flex-col space-y-1.5 max-w-[85%] sm:max-w-[82%] ${
                    message.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div className="flex items-center gap-2 px-1 text-[11px] text-slate-400">
                    <span className="font-medium text-slate-300">
                      {message.role === "user" ? "Customer" : "Convo Desk"}
                    </span>
                    <span>•</span>
                    <span>{message.timestamp}</span>
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`rounded-2xl px-4 py-3.5 shadow-sm transition-all ${
                      message.role === "user"
                        ? "bg-indigo-600 text-white rounded-tr-sm"
                        : "bg-[#161a25] border border-slate-800 text-slate-200 rounded-tl-sm w-full"
                    }`}
                  >
                    {message.content ? (
                      renderMessageContent(message.content, message.id)
                    ) : message.isStreaming ? (
                      <div className="flex items-center gap-1.5 py-1">
                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" />
                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.2s]" />
                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.4s]" />
                      </div>
                    ) : null}

                    {message.isStreaming && message.content && (
                      <span className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse align-middle" />
                    )}
                  </div>

                  {/* Footer actions for assistant */}
                  {message.role === "assistant" && message.content && !message.isStreaming && (
                    <div className="flex items-center gap-3 pt-1 px-1 text-xs text-slate-500">
                      <button
                        onClick={() => handleCopy(message.content, message.id)}
                        className="hover:text-slate-300 transition-colors flex items-center gap-1"
                        title="Copy text"
                      >
                        {copiedId === message.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400 text-xs">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => toggleSpeech(message.content, message.id)}
                        className={`hover:text-slate-300 transition-colors flex items-center gap-1 ${
                          speakingMessageId === message.id ? "text-indigo-400" : ""
                        }`}
                        title="Listen to audio"
                      >
                        {speakingMessageId === message.id ? (
                          <>
                            <VolumeX className="w-3 h-3 text-indigo-400 animate-pulse" />
                            <span className="text-indigo-400 text-xs">Stop</span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3 h-3" />
                            <span>Listen</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {message.role === "user" && (
                  <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                    <User className="w-4 h-4 text-slate-300" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {/* Input Composer Footer */}
        <footer className="border-t border-slate-800/80 bg-[#12151e]/80 backdrop-blur-md px-4 sm:px-6 py-4">
          <div className="max-w-2xl mx-auto space-y-2">
            <div className="relative flex items-end gap-2 bg-[#171b27] border border-slate-700/80 rounded-2xl p-2.5 shadow-xl focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type your name, contact info, enquiry, or preferred date & time..."
                rows={1}
                className="flex-1 bg-transparent border-0 resize-none px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none max-h-40"
              />

              {/* Voice Dictation (Microphone) */}
              <button
                onClick={toggleRecording}
                className={`p-2.5 rounded-xl transition-all shadow-sm shrink-0 ${
                  isRecording
                    ? "bg-rose-600 text-white animate-pulse"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                }`}
                title={isRecording ? "Stop dictation" : "Dictate via microphone"}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              {/* Send / Stop */}
              {isGenerating ? (
                <button
                  onClick={handleStop}
                  className="p-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium transition-all shadow-md shrink-0 flex items-center gap-1.5 text-xs"
                  title="Stop generation"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span className="hidden sm:inline">Stop</span>
                </button>
              ) : (
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white transition-all shadow-md shrink-0 disabled:cursor-not-allowed"
                  title="Send message (Enter)"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between px-2 text-[11px] text-slate-500">
              <span>
                Flow: <strong>Welcome → Contextual Intake → Scheduling → Confirmation</strong>
              </span>
              <span className="hidden sm:inline">
                Real-time Assistant
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
