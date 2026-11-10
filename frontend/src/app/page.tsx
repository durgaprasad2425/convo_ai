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
  Eye,
  PhoneCall,
  PhoneOff,
  PhoneIncoming,
  Activity,
  Headphones,
  Radio,
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
  "I'm here to assist with your questions and schedule an appointment with our team.\n\n" +
  "To get started, may I have your **full name**?";

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
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [calendarAppointments, setCalendarAppointments] = useState<any[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [showEmailPreviewModal, setShowEmailPreviewModal] = useState<any | null>(null);
  const [sentToastMessage, setSentToastMessage] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sentInvitesList, setSentInvitesList] = useState<any[]>([]);
  const [sendingInviteRefId, setSendingInviteRefId] = useState<string | null>(null);

  // Google Calendar Direct API & OAuth State
  const [calendarAuthStatus, setCalendarAuthStatus] = useState<{
    connected: boolean;
    user_email: string | null;
    client_id_configured: boolean;
    auth_url: string | null;
  } | null>(null);
  const [isDisconnectingCalendar, setIsDisconnectingCalendar] = useState(false);
  const autoDispatchedRefIds = useRef<Set<string>>(new Set());

  // Attached file
  const [attachedFile, setAttachedFile] = useState<{ name: string; size: string; content: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio / Speech State
  const [isRecording, setIsRecording] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  // Inbound Call Center Speech-to-Speech State
  const [isInboundCallActive, setIsInboundCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState<"connecting" | "speaking" | "listening" | "thinking" | "ended">("connecting");
  const [callDuration, setCallDuration] = useState(0);
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [liveUserTranscript, setLiveUserTranscript] = useState("");
  const [lastAgentUtterance, setLastAgentUtterance] = useState("");
  const [showCallNotes, setShowCallNotes] = useState(false);
  const [audioBarHeights, setAudioBarHeights] = useState<number[]>([25, 45, 65, 80, 60, 40, 20]);

  const isInboundCallActiveRef = useRef(false);
  const callStatusRef = useRef<"connecting" | "speaking" | "listening" | "thinking" | "ended">("connecting");
  const isCallMutedRef = useRef(false);
  const isSpeakerMutedRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callRecognitionRef = useRef<any>(null);
  const callSilenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const latestMessagesRef = useRef<Message[]>([]);

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
          // Sync any fresh session whose only message was the old welcome text
          const updated = parsed.map((s) => {
            if (s.messages.length === 1 && s.messages[0].role === "assistant") {
              return {
                ...s,
                messages: [{ ...s.messages[0], content: INITIAL_WELCOME_TEXT }],
              };
            }
            return s;
          });
          setSessions(updated);
          setActiveSessionId(updated[0].id);
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
    const phoneMatch = textAll.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b[6-9]\d{9}\b|\b\d{10}\b/);
    const confirmed = textAll.includes("✅") || textAll.toLowerCase().includes("confirmed") || textAll.includes("CNV-");

    let detectedName: string | null = null;
    let detectedPurpose: string | null = null;

    if (userMsgs.length > 0) {
      for (const msg of userMsgs) {
        const text = msg.content;
        const nameMatch = text.match(/(?:my name is|i am|i'm|name:\s*)\s*([a-zA-Z\s]{2,30})/i);
        if (nameMatch) {
          detectedName = nameMatch[1].split(/[.,\n]/)[0].trim();
          break;
        }
      }
      if (!detectedName) {
        const first = userMsgs[0].content.trim();
        const firstChunk = first.split(/[,.\n-]/)[0].trim();
        const words = firstChunk.split(/\s+/);
        const commonWords = ["hi", "hello", "hey", "help", "demo", "pricing", "support", "consultation", "appointment", "schedule", "book", "yes", "no"];
        if (words.length >= 1 && words.length <= 3 && !firstChunk.match(/\d/) && !commonWords.includes(firstChunk.toLowerCase())) {
          detectedName = firstChunk;
        }
      }
      detectedPurpose = userMsgs[0].content;
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

  // Check backend health & Google Calendar OAuth state
  useEffect(() => {
    checkBackendHealth();
    fetchCalendarAuthStatus();

    // Check if returning from Google OAuth redirect
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const isConnected = urlParams.get("calendar_connected");
      const email = urlParams.get("email");
      const calendarError = urlParams.get("calendar_error");

      if (isConnected === "true") {
        setSentToastMessage(`🎉 Google Calendar connected${email ? ` for ${email}` : ""}! Direct event & Meet sync active.`);
        setTimeout(() => setSentToastMessage(null), 5000);
        fetchCalendarAuthStatus();
        window.history.replaceState({}, "", window.location.pathname);
      } else if (calendarError) {
        setSentToastMessage(`⚠️ Google Calendar authorization: ${decodeURIComponent(calendarError)}`);
        setTimeout(() => setSentToastMessage(null), 5000);
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
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

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    isInboundCallActiveRef.current = isInboundCallActive;
  }, [isInboundCallActive]);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  useEffect(() => {
    isCallMutedRef.current = isCallMuted;
  }, [isCallMuted]);

  useEffect(() => {
    isSpeakerMutedRef.current = isSpeakerMuted;
  }, [isSpeakerMuted]);

  // Call duration interval
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isInboundCallActive) {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isInboundCallActive]);

  // Audio equalizer dynamic heights animation
  useEffect(() => {
    let animInterval: NodeJS.Timeout | null = null;
    if (isInboundCallActive && (callStatus === "speaking" || callStatus === "listening")) {
      animInterval = setInterval(() => {
        setAudioBarHeights([
          20 + Math.floor(Math.random() * 60),
          35 + Math.floor(Math.random() * 65),
          25 + Math.floor(Math.random() * 80),
          40 + Math.floor(Math.random() * 85),
          30 + Math.floor(Math.random() * 75),
          25 + Math.floor(Math.random() * 70),
          15 + Math.floor(Math.random() * 55),
        ]);
      }, 180);
    } else {
      setAudioBarHeights([15, 20, 25, 30, 25, 20, 15]);
    }
    return () => {
      if (animInterval) clearInterval(animInterval);
    };
  }, [isInboundCallActive, callStatus]);

  const formatCallTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const fetchCalendarAuthStatus = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/calendar/auth/status");
      if (res.ok) {
        const data = await res.json();
        setCalendarAuthStatus(data);
      }
    } catch (e) {
      console.warn("Failed to fetch calendar auth status:", e);
    }
  };

  const disconnectGoogleCalendar = async () => {
    setIsDisconnectingCalendar(true);
    try {
      await fetch("http://localhost:8000/api/calendar/auth/disconnect", { method: "POST" });
      setSentToastMessage("Disconnected Google Calendar.");
      setTimeout(() => setSentToastMessage(null), 3500);
      fetchCalendarAuthStatus();
    } catch (e) {
      console.warn("Error disconnecting calendar:", e);
    } finally {
      setIsDisconnectingCalendar(false);
    }
  };

  const fetchCalendarAppointments = async () => {
    setCalendarLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/appointments");
      if (res.ok) {
        const data = await res.json();
        setCalendarAppointments(data);
      }
    } catch (e) {
      console.warn("Failed to fetch appointments:", e);
    } finally {
      setCalendarLoading(false);
    }
  };

  const fetchSentInvites = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/calendar/invitations");
      if (res.ok) {
        const data = await res.json();
        setSentInvitesList(data);
      }
    } catch (e) {
      console.warn("Failed to fetch sent invites:", e);
    }
  };

  const sendCustomerCalendarInvite = async (
    refId: string,
    name: string,
    timeStr: string,
    email: string,
    purpose: string,
    phone?: string,
    showPreview: boolean = false
  ) => {
    if (!email || !email.includes("@")) {
      setSentToastMessage("⚠️ Please provide a valid customer email to send calendar event.");
      setTimeout(() => setSentToastMessage(null), 3500);
      return;
    }
    setSendingInviteRefId(refId);
    try {
      const res = await fetch("http://localhost:8000/api/calendar/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref_id: refId,
          name: name || "Customer",
          email: email,
          phone: phone || "",
          purpose: purpose || "Consultation",
          appointment_time: timeStr || "Tomorrow at 10:00 AM",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.direct_api_synced) {
          setSentToastMessage(`📅 Directly added to Google Calendar & dispatched to ${email}!`);
        } else {
          setSentToastMessage(`✉️ Calendar event invitation dispatched to ${email}!`);
        }
        if (showPreview && data.record) {
          setShowEmailPreviewModal(data.record);
        }
        fetchSentInvites();
        fetchCalendarAppointments();
        setTimeout(() => setSentToastMessage(null), 4500);
      } else {
        setSentToastMessage("⚠️ Could not dispatch calendar event. Check server connection.");
        setTimeout(() => setSentToastMessage(null), 3500);
      }
    } catch (e) {
      console.warn("Failed to dispatch calendar invite:", e);
      setSentToastMessage("⚠️ Error dispatching calendar invite.");
      setTimeout(() => setSentToastMessage(null), 3500);
    } finally {
      setSendingInviteRefId(null);
    }
  };

  // Automatically detects confirmed appointments in assistant responses and dispatches to Google Calendar
  const detectAndAutoDispatchAppointment = async (text: string) => {
    if (!text) return;
    const isConfirmation =
      text.includes("CNV-") ||
      text.includes("Reference ID") ||
      text.toLowerCase().includes("reference id") ||
      text.toLowerCase().includes("appointment confirmed");
    if (!isConfirmation) return;

    const refMatch = text.match(/CNV-[\w\d]+/i);
    const refId = refMatch ? refMatch[0] : null;
    if (!refId || autoDispatchedRefIds.current.has(refId.toUpperCase())) return;

    const emailMatch = text.match(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/);
    const email = emailMatch ? emailMatch[0] : "";
    if (!email) return;

    let name = "Customer";
    const nameLine = text.match(/(?:Customer\s*Name|Name)[*:\s|]+([^\r\n|*]+)/i);
    if (nameLine && nameLine[1]) {
      name = nameLine[1].replace(/[*_`]/g, "").trim();
    }

    let timeStr = "Tomorrow at 10:00 AM";
    const timeLine = text.match(/(?:Scheduled\s*Date\s*&\s*Time|Date\s*&\s*Time|Scheduled\s*Time|Appointment\s*Time)[*:\s|]+([^\r\n|*]+)/i);
    if (timeLine && timeLine[1]) {
      timeStr = timeLine[1].replace(/[*_`]/g, "").trim();
    }

    let purpose = "Consultation";
    const purposeLine = text.match(/(?:Purpose\s*(?:of\s*Enquiry)?)[*:\s|]+([^\r\n|*]+)/i);
    if (purposeLine && purposeLine[1]) {
      purpose = purposeLine[1].replace(/[*_`]/g, "").trim();
    }

    let phone = "";
    const phoneLine = text.match(/(?:Contact\s*Number|Phone)[*:\s|]+([^\r\n|*]+)/i);
    if (phoneLine && phoneLine[1]) {
      phone = phoneLine[1].replace(/[*_`]/g, "").trim();
    }

    autoDispatchedRefIds.current.add(refId.toUpperCase());
    await sendCustomerCalendarInvite(refId, name, timeStr, email, purpose, phone, false);
  };

  useEffect(() => {
    if (showCalendarModal) {
      fetchCalendarAppointments();
      fetchSentInvites();
      fetchCalendarAuthStatus();
    }
  }, [showCalendarModal]);

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

  // Google Calendar Integration Engine
  const parseAppointmentDates = (timeStr: string): { startISO: string; endISO: string; formatted: string } => {
    const now = new Date();
    let startDate = new Date();

    // Clean markdown bold or ticks
    const clean = (timeStr || "").replace(/[*_#`~]/g, "").trim();

    // Check for explicit date strings like "Wednesday, November 11, 2026, at 2:30 PM"
    const parsedTimestamp = Date.parse(clean.replace(/at\s+/i, ""));
    if (!isNaN(parsedTimestamp)) {
      startDate = new Date(parsedTimestamp);
    } else {
      const lower = clean.toLowerCase();
      if (lower.includes("tomorrow")) {
        startDate.setDate(now.getDate() + 1);
      } else {
        const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        for (let i = 0; i < weekdays.length; i++) {
          if (lower.includes(weekdays[i])) {
            const currentDay = now.getDay();
            let daysAhead = (i - currentDay + 7) % 7;
            if (daysAhead === 0) daysAhead = 7;
            if (lower.includes("next " + weekdays[i])) daysAhead += 7;
            startDate.setDate(now.getDate() + daysAhead);
            break;
          }
        }
      }

      // Parse time e.g. "10:00 AM", "2:30 PM", "11:00 AM"
      const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
      if (timeMatch) {
        let hour = parseInt(timeMatch[1], 10);
        const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
        const meridiem = timeMatch[3];
        if (meridiem === "pm" && hour < 12) hour += 12;
        if (meridiem === "am" && hour === 12) hour = 0;
        startDate.setHours(hour, minute, 0, 0);
      } else {
        startDate.setHours(14, 30, 0, 0); // Default to 2:30 PM
      }
    }

    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 60 minutes consultation

    const formatGCal = (d: Date) => {
      const pad = (n: number) => n.toString().padStart(2, "0");
      return (
        d.getUTCFullYear().toString() +
        pad(d.getUTCMonth() + 1) +
        pad(d.getUTCDate()) +
        "T" +
        pad(d.getUTCHours()) +
        pad(d.getUTCMinutes()) +
        pad(d.getUTCSeconds()) +
        "Z"
      );
    };

    const formatted = startDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    return {
      startISO: formatGCal(startDate),
      endISO: formatGCal(endDate),
      formatted,
    };
  };

  const createGoogleCalendarLink = (
    timeStr: string,
    name: string,
    email?: string,
    refId?: string,
    purpose?: string,
    phone?: string
  ) => {
    const { startISO, endISO } = parseAppointmentDates(timeStr);
    const title = encodeURIComponent(`Convo Desk Consultation: ${name || "Customer"}`);
    const details = encodeURIComponent(
      `Customer Intake & Appointment Booking\n\n` +
      `Reference ID: ${refId || "CNV-BOOKING"}\n` +
      `Customer Name: ${name || "Customer"}\n` +
      (phone ? `Phone: ${phone}\n` : "") +
      (email ? `Email: ${email}\n` : "") +
      (purpose ? `Purpose: ${purpose}\n\n` : "\n") +
      `Scheduled via Convo Desk.`
    );
    const location = encodeURIComponent("Google Meet (Online Video Consultation)");
    let url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startISO}/${endISO}&details=${details}&location=${location}`;
    if (email && email.includes("@")) {
      url += `&add=${encodeURIComponent(email)}`;
    }
    return url;
  };

  const downloadIcsInvite = (
    refId: string,
    name: string,
    timeStr: string,
    email: string,
    purpose: string
  ) => {
    const downloadUrl = `http://localhost:8000/api/calendar/ics/${encodeURIComponent(
      refId || "CNV-BOOKING"
    )}?name=${encodeURIComponent(name || "Customer")}&time=${encodeURIComponent(
      timeStr
    )}&email=${encodeURIComponent(email || "")}&purpose=${encodeURIComponent(
      purpose || "Consultation"
    )}`;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", `ConvoDesk_${refId || "Booking"}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Send message
  const handleSend = async (customPrompt?: string, overrideHistory?: Message[]): Promise<string> => {
    let textToSend = (customPrompt || input).trim();
    if (!textToSend && !attachedFile) return "";
    if (isGenerating) return "";

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

    const baseHistory = overrideHistory || latestMessagesRef.current;
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
    let accumulatedText = "";

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
    if (accumulatedText) {
      detectAndAutoDispatchAppointment(accumulatedText);
    }
    return accumulatedText;
  };

  // --- Inbound Call Center Speech-to-Speech Engine ---

  const cleanTextForSpeech = (raw: string): string => {
    if (!raw) return "";
    if (raw.includes("| Reference ID |") || raw.includes("| Field |") || raw.includes("Booking Confirmation")) {
      const idMatch = raw.match(/CNV-\d+/i);
      const refId = idMatch ? idMatch[0] : "CNV-1024";
      return `Your appointment has been confirmed! Your reference ID is ${refId}. We have recorded all your details and sent confirmation to your email. Thank you for calling Convo Desk!`;
    }
    return raw
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\|[\s\S]*?\|/g, " ")
      .replace(/[*_#`~>]/g, "")
      .replace(/👋|✅|⚠️|📅|⏱️|✨|💬|🤖|📞|🎉|📋/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  };

  const speakAgentMessage = (text: string, onEnd?: () => void) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      if (onEnd) onEnd();
      else startListeningToCaller();
      return;
    }

    window.speechSynthesis.cancel();

    if (isSpeakerMutedRef.current) {
      if (onEnd) onEnd();
      else startListeningToCaller();
      return;
    }

    const clean = cleanTextForSpeech(text);
    setLastAgentUtterance(clean);
    setCallStatus("speaking");
    callStatusRef.current = "speaking";

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice =
      voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Natural") ||
            v.name.includes("Google") ||
            v.name.includes("Jenny") ||
            v.name.includes("Guy") ||
            v.name.includes("Zira") ||
            v.name.includes("Samantha"))
      ) || voices.find((v) => v.lang.startsWith("en"));

    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onend = () => {
      if (!isInboundCallActiveRef.current) return;
      if (onEnd) {
        onEnd();
      } else {
        startListeningToCaller();
      }
    };

    utterance.onerror = () => {
      if (!isInboundCallActiveRef.current) return;
      if (onEnd) {
        onEnd();
      } else {
        startListeningToCaller();
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  const startListeningToCaller = () => {
    if (!isInboundCallActiveRef.current) return;
    if (isCallMutedRef.current) {
      setCallStatus("listening");
      callStatusRef.current = "listening";
      return;
    }

    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setCallStatus("listening");
      callStatusRef.current = "listening";
      return;
    }

    try {
      if (callRecognitionRef.current) {
        try {
          callRecognitionRef.current.abort();
        } catch {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      setCallStatus("listening");
      callStatusRef.current = "listening";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript + " ";
        }
        transcript = transcript.trim();
        if (transcript) {
          setLiveUserTranscript(transcript);

          // Reset silence timer on every new speech event
          if (callSilenceTimerRef.current) {
            clearTimeout(callSilenceTimerRef.current);
          }

          // Auto turn-taking: 1.5 seconds after user stops speaking, submit caller's message
          callSilenceTimerRef.current = setTimeout(() => {
            if (!isInboundCallActiveRef.current) return;
            if (callStatusRef.current !== "listening") return;
            if (transcript.trim().length > 0) {
              try {
                recognition.stop();
              } catch {}
              handleCallerSpoke(transcript.trim());
            }
          }, 1500);
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onerror = (e: any) => {
        if (e.error !== "no-speech" && e.error !== "aborted") {
          console.warn("Call recognition warning:", e.error);
        }
      };

      recognition.onend = () => {
        // Automatically restart if still in listening mode
        if (isInboundCallActiveRef.current && callStatusRef.current === "listening" && !isCallMutedRef.current) {
          try {
            recognition.start();
          } catch {}
        }
      };

      callRecognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn("Could not start call recognition:", err);
      setCallStatus("listening");
      callStatusRef.current = "listening";
    }
  };

  const handleCallerSpoke = async (callerText: string) => {
    if (!callerText.trim()) return;
    setCallStatus("thinking");
    callStatusRef.current = "thinking";
    setLiveUserTranscript(callerText);

    const assistantReply = await handleSend(callerText, latestMessagesRef.current);

    if (!isInboundCallActiveRef.current) return;

    if (assistantReply && assistantReply.trim()) {
      speakAgentMessage(assistantReply);
    } else {
      startListeningToCaller();
    }
  };

  const startInboundCall = () => {
    setIsInboundCallActive(true);
    isInboundCallActiveRef.current = true;
    setCallDuration(0);
    setIsCallMuted(false);
    isCallMutedRef.current = false;
    setIsSpeakerMuted(false);
    isSpeakerMutedRef.current = false;
    setLiveUserTranscript("");
    setCallStatus("connecting");
    callStatusRef.current = "connecting";

    // Simulate 1.1s phone connection ringing
    setTimeout(() => {
      if (!isInboundCallActiveRef.current) return;
      const currentMsgs = latestMessagesRef.current;
      const lastAsst = [...currentMsgs].reverse().find((m) => m.role === "assistant");
      const greeting = lastAsst ? lastAsst.content : INITIAL_WELCOME_TEXT;

      speakAgentMessage(greeting);
    }, 1100);
  };

  const endInboundCall = () => {
    isInboundCallActiveRef.current = false;
    setIsInboundCallActive(false);
    setCallStatus("ended");
    callStatusRef.current = "ended";

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (callRecognitionRef.current) {
      try {
        callRecognitionRef.current.abort();
      } catch {}
      callRecognitionRef.current = null;
    }
    if (callSilenceTimerRef.current) {
      clearTimeout(callSilenceTimerRef.current);
      callSilenceTimerRef.current = null;
    }
  };

  const toggleCallMute = () => {
    const nextMuted = !isCallMuted;
    setIsCallMuted(nextMuted);
    isCallMutedRef.current = nextMuted;

    if (nextMuted) {
      if (callRecognitionRef.current) {
        try {
          callRecognitionRef.current.stop();
        } catch {}
      }
    } else {
      if (callStatus === "listening") {
        startListeningToCaller();
      }
    }
  };

  const toggleSpeakerMute = () => {
    const nextMuted = !isSpeakerMuted;
    setIsSpeakerMuted(nextMuted);
    isSpeakerMutedRef.current = nextMuted;

    if (nextMuted) {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (callStatus === "speaking") {
        startListeningToCaller();
      }
    }
  };

  const submitCurrentSpeech = () => {
    if (!liveUserTranscript.trim()) return;
    if (callSilenceTimerRef.current) {
      clearTimeout(callSilenceTimerRef.current);
    }
    if (callRecognitionRef.current) {
      try {
        callRecognitionRef.current.stop();
      } catch {}
    }
    handleCallerSpoke(liveUserTranscript.trim());
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
    const isConfirmationCard =
      (content.includes("CNV-") || content.toLowerCase().includes("reference id")) &&
      (content.includes("|") ||
       content.toLowerCase().includes("appointment confirmed") ||
       content.toLowerCase().includes("booking summary") ||
       content.toLowerCase().includes("booking confirmation") ||
       content.toLowerCase().includes("scheduled"));

    if (isConfirmationCard) {
      const lines = content.split("\n");
      const introText: string[] = [];
      const outroText: string[] = [];
      const tableLines: string[] = [];
      let inTable = false;
      let afterTable = false;

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("|") && (trimmed.endsWith("|") || trimmed.includes("|"))) {
          inTable = true;
          tableLines.push(trimmed);
        } else {
          if (inTable) {
            afterTable = true;
          }
          if (!afterTable) {
            introText.push(line);
          } else {
            // Strip any unwanted trailing questions like "Would you like to add any notes?"
            const isQuestion =
              trimmed.endsWith("?") ||
              trimmed.toLowerCase().includes("additional notes") ||
              trimmed.toLowerCase().includes("anything else") ||
              trimmed.toLowerCase().includes("notes for our team") ||
              trimmed.toLowerCase().includes("can i help with anything");
            if (!isQuestion && trimmed.length > 0) {
              outroText.push(line);
            }
          }
        }
      });

      // Flexible Table Parser: Supports Horizontal tables, Vertical tables, with or without colons
      const parsedFields: Record<string, string> = {};

      if (tableLines.length >= 2) {
        const row0Parts = tableLines[0].split("|").slice(1, -1).map((s) => s.trim().replace(/\*\*/g, ""));
        const row1IsSeparator = tableLines[1].replace(/[\s|:\-]/g, "").length === 0;

        const isHorizontal =
          row1IsSeparator &&
          !row0Parts.some((p) => p.toLowerCase() === "field") &&
          row0Parts.length >= 2 &&
          tableLines.length >= 3;

        if (isHorizontal) {
          const row2Parts = tableLines[2].split("|").slice(1, -1).map((s) => s.trim().replace(/\*\*/g, ""));
          row0Parts.forEach((header, idx) => {
            if (row2Parts[idx]) {
              parsedFields[header.toLowerCase()] = row2Parts[idx];
            }
          });
        } else {
          // Vertical table: Label | Value
          tableLines.forEach((tLine) => {
            if (tLine.replace(/[\s|:\-]/g, "").length === 0) return;
            const parts = tLine.split("|").slice(1, -1).map((s) => s.trim().replace(/\*\*/g, ""));
            if (parts.length >= 2) {
              const label = parts[0].toLowerCase();
              if (label !== "field") {
                parsedFields[label] = parts[1];
              }
            }
          });
        }
      }

      // Helper to match parsed field keys
      const getField = (aliases: string[]): string | undefined => {
        for (const [k, v] of Object.entries(parsedFields)) {
          if (aliases.some((a) => k.includes(a))) {
            return v;
          }
        }
        return undefined;
      };

      // 1. Reference ID
      const refIdVal =
        getField(["reference", "ref id", "ref", "booking id"]) ||
        content.match(/CNV-\d+/i)?.[0] ||
        "CNV-1026";

      // 2. Email Address
      const emailVal =
        getField(["email", "e-mail", "mail"]) ||
        content.match(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/)?.[0] ||
        intakeState.email ||
        "";

      // 3. Contact Number
      const phoneVal =
        getField(["phone", "contact", "mobile", "number", "tel"]) ||
        content.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b[6-9]\d{9}\b|\b\d{10}\b/)?.[0] ||
        intakeState.phone ||
        "";

      // 4. Customer Name
      let nameVal =
        getField(["customer name", "name", "client"]) ||
        content.match(/(?:customer name|name)\s*:\s*([^\n\r,|]+)/i)?.[1]?.trim() ||
        intakeState.name;

      if (!nameVal || nameVal.toLowerCase() === "customer" || nameVal.toLowerCase() === "valued customer") {
        for (const msg of messages) {
          if (msg.role === "user") {
            const mMatch = msg.content.match(/(?:my name is|i am|i'm|name:\s*)\s*([a-zA-Z\s]{2,30})/i);
            if (mMatch) {
              nameVal = mMatch[1].split(/[.,\n]/)[0].trim();
              break;
            }
            const chunk = msg.content.split(/[,.\n-]/)[0].trim();
            const words = chunk.split(/\s+/);
            const common = ["hi", "hello", "hey", "help", "demo", "pricing", "support", "consultation", "appointment", "schedule", "book", "yes", "no"];
            if (words.length >= 1 && words.length <= 3 && !chunk.match(/\d/) && !common.includes(chunk.toLowerCase())) {
              nameVal = chunk;
              break;
            }
          }
        }
      }
      if (!nameVal) nameVal = "Valued Customer";

      // 5. Purpose of Enquiry
      const purposeVal =
        getField(["purpose", "enquiry", "inquiry", "service", "topic", "requirement"]) ||
        content.match(/purpose(?:\s+of\s+enquiry)?\s*:\s*([^\n\r|]+)/i)?.[1]?.trim() ||
        intakeState.purpose ||
        "AI Tool Integration & Consulting";

      // 6. Scheduled Date & Time
      let appointmentVal =
        (parsedFields["date"] && parsedFields["time"]
          ? `${parsedFields["date"]} at ${parsedFields["time"]}`
          : undefined) ||
        getField(["scheduled date & time", "date & time", "scheduled", "appointment", "date", "time"]) ||
        content.match(/(?:scheduled date & time|scheduled for|date & time)\s*:\s*([^\n\r|]+)/i)?.[1]?.trim() ||
        intakeState.appointment ||
        "Wednesday, November 11, 2026 at 10:00 AM";

      const { formatted: formattedDate } = parseAppointmentDates(appointmentVal);

      // Explicitly display ALL 6 intake fields in the card grid
      const displayRows: { label: string; value: string }[] = [
        { label: "Reference ID", value: refIdVal },
        { label: "Customer Name", value: nameVal },
        { label: "Contact Number", value: phoneVal || "Provided" },
        { label: "Email Address", value: emailVal || "Provided" },
        { label: "Purpose of Enquiry", value: purposeVal },
        { label: "Scheduled Date & Time", value: appointmentVal },
      ];

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
                  <p className="text-[11px] text-slate-500">Official Scheduling Receipt • Ref: {refIdVal}</p>
                </div>
              </div>
              <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                Confirmed
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {displayRows.map((row, idx) => (
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

            {/* Google Calendar Integration Box */}
            <div className="rounded-xl border border-indigo-200/90 bg-white p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span>Google Calendar Integration</span>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-full">
                        Meet Ready
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {formattedDate} • 60 Min Consultation
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-600 bg-slate-50 rounded-lg p-2.5 space-y-1 border border-slate-100">
                <div className="flex justify-between">
                  <span className="text-slate-400">Event Title:</span>
                  <span className="font-semibold text-slate-700">Convo Desk Consultation: {nameVal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Location:</span>
                  <span className="font-semibold text-indigo-600">Google Meet (Online Video Call)</span>
                </div>
                {emailVal && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Guest Attendee:</span>
                    <span className="font-semibold text-slate-700">{emailVal}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <a
                  href={createGoogleCalendarLink(appointmentVal, nameVal, emailVal, refIdVal, purposeVal, phoneVal)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold transition-all shadow-sm shadow-indigo-500/20 cursor-pointer"
                  title="Open directly in Google Calendar with date, time, and Google Meet pre-filled"
                >
                  <CalendarPlus className="w-4 h-4" />
                  <span>Add to Google Calendar</span>
                  <ExternalLink className="w-3 h-3 opacity-80" />
                </a>

                <button
                  onClick={() => downloadIcsInvite(refIdVal, nameVal, appointmentVal, emailVal, purposeVal)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                  title="Download .ics file for Google Calendar, Apple Calendar, or Outlook"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Download .ics Invite</span>
                </button>

                <button
                  onClick={exportChat}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Export Receipt</span>
                </button>
              </div>
            </div>

            {/* Customer Email Calendar Event Dispatch Section */}
            <div className="rounded-xl border border-emerald-200/90 bg-emerald-50/70 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                    <Mail className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span>Customer Calendar Event Delivery</span>
                      {calendarAuthStatus?.connected && (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded-full">
                          Direct Sync Active
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-emerald-800 font-medium">
                      {emailVal ? `Sent directly to ${emailVal}` : "Email will be dispatched upon confirming address"}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
                  Auto-Dispatched
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                <button
                  onClick={() =>
                    sendCustomerCalendarInvite(
                      refIdVal,
                      nameVal,
                      appointmentVal,
                      emailVal,
                      purposeVal,
                      phoneVal,
                      true
                    )
                  }
                  disabled={sendingInviteRefId === refIdVal || !emailVal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors shadow-2xs cursor-pointer"
                  title="Resend or dispatch the calendar invitation to customer"
                >
                  <Send className="w-3 h-3" />
                  <span>
                    {sendingInviteRefId === refIdVal ? "Sending..." : "Resend Calendar Event"}
                  </span>
                </button>

                <button
                  onClick={() => {
                    const sample = {
                      ref_id: refIdVal,
                      name: nameVal,
                      recipient: emailVal || "customer@example.com",
                      appointment_time: formattedDate,
                      subject: `📅 Appointment Confirmed: Convo Desk Consultation [${refIdVal}]`,
                      status: "delivered",
                      mode: "customer_delivery",
                      preview_html: "",
                    };
                    setShowEmailPreviewModal(sample);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-emerald-300 text-emerald-800 text-xs font-medium transition-colors cursor-pointer"
                  title="Preview the exact email invitation the customer receives"
                >
                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Preview Email Invitation</span>
                </button>
              </div>
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
            {/* Start Inbound Call Button */}
            <button
              onClick={startInboundCall}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
              title="Launch hands-free Inbound Call Center voice experience"
            >
              <PhoneCall className="w-3.5 h-3.5 animate-pulse" />
              <span>Inbound Call</span>
            </button>

            {/* Google Calendar Hub Button */}
            <button
              onClick={() => {
                setShowCalendarModal(true);
                fetchCalendarAppointments();
                fetchCalendarAuthStatus();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 hover:bg-indigo-100/80 text-indigo-700 text-xs font-semibold border border-indigo-200/80 transition-all cursor-pointer shadow-2xs"
              title="View Scheduled Google Calendar Events & Direct Sync Status"
            >
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>Google Calendar</span>
              {calendarAuthStatus?.connected ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Direct Google Calendar API Connected" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-amber-400" title="Click to Connect Direct Google Calendar Sync" />
              )}
            </button>
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

        {/* Google Calendar Hub & Scheduled Events Modal */}
        {showCalendarModal && (
          <div className="fixed inset-0 bg-black/30 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl p-6 max-w-lg w-full border border-slate-200 shadow-2xl space-y-4 max-h-[88vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Google Calendar Integration</h3>
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>{calendarAuthStatus?.connected ? `Direct Calendar Sync Active (${calendarAuthStatus.user_email || 'Connected'})` : "Google Meet & One-Click Sync Active"}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowCalendarModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Direct Google Calendar API & OAuth Card */}
              {calendarAuthStatus?.connected ? (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-bold text-emerald-900">Direct Google Calendar & Meet Sync Active</span>
                    </div>
                    <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300">
                      OAuth Connected
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-800 space-y-0.5">
                    <div>• Connected Google Account: <strong>{calendarAuthStatus?.user_email || "Primary Calendar"}</strong></div>
                    <div>• Bookings directly inject into your Google Calendar grid</div>
                    <div>• Generates real Google Meet video conference rooms</div>
                    <div>• Customer automatically receives Google Calendar invite</div>
                  </div>
                  <div className="pt-1 flex items-center justify-between border-t border-emerald-200/60">
                    <a
                      href="https://calendar.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-emerald-700 hover:text-emerald-900 font-semibold"
                    >
                      <span>Open Google Calendar Grid</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      onClick={disconnectGoogleCalendar}
                      disabled={isDisconnectingCalendar}
                      className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold cursor-pointer underline"
                    >
                      {isDisconnectingCalendar ? "Disconnecting..." : "Disconnect Account"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-50/90 to-purple-50/90 border border-indigo-200/90 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
                        <CalendarPlus className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">Direct Google Calendar Sync</div>
                        <div className="text-[11px] text-indigo-600 font-medium">1-Click Google OAuth Connection</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                      Ready to Connect
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Connect your Google account so every confirmed intake booking is <strong>directly created in Google Calendar</strong>, a <strong>Google Meet video room</strong> is generated, and your customer receives a native invitation!
                  </p>

                  <div className="space-y-1.5 pt-0.5">
                    <a
                      href="http://localhost:8000/api/calendar/auth/login"
                      className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs transition-all shadow-md shadow-indigo-500/20 cursor-pointer"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      <span>Connect Google Calendar (Sign in with Google)</span>
                      <ExternalLink className="w-3 h-3 opacity-80" />
                    </a>

                    <div className="p-2 rounded-xl bg-white/80 border border-indigo-100 text-[10px] text-slate-500 space-y-0.5">
                      <div><strong>OAuth Client ID:</strong> <code className="text-indigo-600 break-all">{calendarAuthStatus?.client_id_configured ? "1062610911553-fbgvncd6v91h6j8cmctra9o11tj3gr84.apps.googleusercontent.com" : "Configured in backend/.env"}</code></div>
                      <div><strong>Redirect URI:</strong> <code className="text-slate-700 font-mono">http://localhost:8000/api/calendar/auth/callback</code></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Live SMTP Dispatch Status */}
              <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                    <Mail className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800">Gmail SMTP Email Delivery:</span>
                    <span className="text-emerald-700 font-medium ml-1">durgaprasad7330640851@gmail.com</span>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                  Live
                </span>
              </div>

              {/* Scheduled Appointments List */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 pt-1">
                  <span>Scheduled Consultations ({calendarAppointments.length})</span>
                  <button
                    onClick={fetchCalendarAppointments}
                    disabled={calendarLoading}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 cursor-pointer font-medium"
                  >
                    {calendarLoading ? "Refreshing..." : "Refresh"}
                  </button>
                </div>

                {calendarAppointments.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    No consultations booked yet. Complete an intake flow to sync your first appointment!
                  </div>
                ) : (
                  calendarAppointments.map((app) => (
                    <div
                      key={app.id}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs hover:border-indigo-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-slate-900 text-xs">{app.name}</div>
                          <div className="text-[11px] text-indigo-600 font-semibold">{app.appointment_time}</div>
                        </div>
                        <span className="text-[10px] font-mono font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md">
                          {app.id}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 space-y-0.5">
                        {app.email && <div>Email: {app.email}</div>}
                        {app.phone && <div>Phone: {app.phone}</div>}
                        {app.purpose && <div className="truncate">Purpose: {app.purpose}</div>}
                      </div>

                      <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
                        <a
                          href={createGoogleCalendarLink(app.appointment_time, app.name, app.email, app.id, app.purpose, app.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          <CalendarPlus className="w-3 h-3" />
                          <span>Open in Google Calendar</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-80" />
                        </a>

                        <button
                          onClick={() => downloadIcsInvite(app.id, app.name, app.appointment_time, app.email, app.purpose)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
                        >
                          <Download className="w-3 h-3 text-slate-500" />
                          <span>.ics Invite</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
                {/* Customer Email Calendar Dispatches Section */}
                {sentInvitesList.length > 0 && (
                  <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-emerald-950">
                      <div className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Customer Email Dispatches ({sentInvitesList.length})</span>
                      </div>
                      <span className="text-[10px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-semibold">
                        Calendar Invites Sent
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {sentInvitesList.map((inv, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-xl bg-white border border-emerald-100 text-[11px]"
                        >
                          <div className="truncate mr-2">
                            <span className="font-semibold text-slate-800">{inv.recipient}</span>
                            <span className="text-slate-400"> • {inv.appointment_time}</span>
                          </div>
                          <button
                            onClick={() => setShowEmailPreviewModal(inv)}
                            className="text-emerald-700 hover:text-emerald-900 font-semibold flex items-center gap-1 shrink-0 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Preview</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <a
                  href="https://calendar.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1 font-medium"
                >
                  <span>Open calendar.google.com</span>
                  <ExternalLink className="w-3 h-3" />
                </a>

                <button
                  onClick={() => setShowCalendarModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Email Preview Modal */}
        {showEmailPreviewModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl p-6 max-w-2xl w-full border border-slate-200 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Customer Calendar Email Preview</h3>
                    <p className="text-[11px] text-slate-400">
                      Dispatched to: <strong>{showEmailPreviewModal.recipient}</strong>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowEmailPreviewModal(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Email Envelope Metadata */}
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div>
                  <span className="text-slate-400">Subject:</span>{" "}
                  <strong className="text-slate-800">
                    {showEmailPreviewModal.subject || `📅 Appointment Confirmed: Convo Desk Consultation [${showEmailPreviewModal.ref_id}]`}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400">From:</span>{" "}
                  <span className="text-slate-700">Convo Desk Invitations &lt;noreply@convodesk.com&gt;</span>
                </div>
                <div>
                  <span className="text-slate-400">To:</span>{" "}
                  <span className="text-slate-700 font-semibold">{showEmailPreviewModal.recipient}</span>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <span className="text-slate-400">Attached:</span>
                  <span className="text-[10px] font-mono bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    invite.ics (text/calendar; method=REQUEST)
                  </span>
                </div>
              </div>

              {/* Rendered Email Body */}
              <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl p-4 bg-slate-50">
                <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm space-y-4 text-xs text-slate-700">
                  <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white space-y-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
                      Calendar Invitation
                    </span>
                    <h4 className="text-base font-bold">Appointment Confirmed!</h4>
                    <p className="text-[11px] text-indigo-100">Convo Desk Intake & Consultation</p>
                  </div>

                  <p>
                    Hello <strong>{showEmailPreviewModal.name || "Customer"}</strong>,<br />
                    Your consultation has been confirmed. Below are your meeting details and access links:
                  </p>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Booking Ref:</span>
                      <span className="font-mono font-bold text-slate-800">{showEmailPreviewModal.ref_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Date & Time:</span>
                      <span className="font-bold text-indigo-600">{showEmailPreviewModal.appointment_time}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Location:</span>
                      <span className="font-semibold text-emerald-600">Google Meet Video Conference</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <a
                      href={showEmailPreviewModal.google_calendar_url || createGoogleCalendarLink(showEmailPreviewModal.appointment_time, showEmailPreviewModal.name, showEmailPreviewModal.recipient, showEmailPreviewModal.ref_id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 text-white font-semibold text-xs shadow-xs"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      <span>Add to Google Calendar</span>
                    </a>

                    <a
                      href="https://meet.google.com/new"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white font-semibold text-xs shadow-xs"
                    >
                      <span>Join Google Meet</span>
                    </a>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setShowEmailPreviewModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Toast Notification */}
        {sentToastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-semibold animate-in slide-in-from-bottom duration-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-200" />
            <span>{sentToastMessage}</span>
          </div>
        )}

        {/* Conversation Stream */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Quick Time Slot Chips (ONLY shown if customer asks for available slots or assistant offers slots) */}
            {(() => {
              const lastAsst = [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
              const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
              const userAsked = /(slot|available|when|option|free|not sure|don't know|anytime|what time|what day)/i.test(lastUser);
              const asstOffered = /(openings|available slots|which time works|which of these|slots this week)/i.test(lastAsst);
              const shouldShowSlots = intakeState.step === 3 && !intakeState.confirmed && (userAsked || asstOffered);

              if (!shouldShowSlots) return null;

              return (
                <div className="p-4 rounded-2xl bg-white border border-purple-200 shadow-sm space-y-2.5">
                  <div className="text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span>Available appointment slots:</span>
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
              );
            })()}

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

                {/* Switch to Inbound Call Button */}
                <button
                  type="button"
                  onClick={startInboundCall}
                  className="p-2 rounded-full text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                  title="Switch to Hands-Free Inbound Call Mode"
                >
                  <PhoneIncoming className="w-4 h-4" />
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

      {/* Inbound Call Center Speech-to-Speech Console Overlay */}
      {isInboundCallActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-gradient-to-b from-[#0f172a] via-[#1e1b4b] to-[#0f172a] border border-indigo-500/30 rounded-3xl shadow-2xl text-white overflow-hidden flex flex-col max-h-[92vh]">
            {/* Ambient Top Glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

            {/* Top Header of Call Console */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 relative z-10 bg-white/5 backdrop-blur-xs">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold tracking-wider text-emerald-400 uppercase">
                      Live Inbound Hotline
                    </span>
                    <span className="text-white/30">•</span>
                    <span className="text-xs font-mono font-bold bg-white/10 px-2.5 py-0.5 rounded-full text-slate-200 border border-white/10">
                      {formatCallTime(callDuration)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">Convo Desk Intake & Scheduling Agent</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCallNotes(!showCallNotes)}
                  className={`p-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                    showCallNotes
                      ? "bg-indigo-600 text-white"
                      : "bg-white/10 text-slate-300 hover:bg-white/15"
                  }`}
                  title="Toggle Live Intake Notes"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Intake Notes</span>
                </button>

                <button
                  onClick={endInboundCall}
                  className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/20 hover:text-rose-400 text-slate-300 transition-colors cursor-pointer"
                  title="End Inbound Call"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Call Stage */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 relative z-10">
              {/* Central Visualizer Orb & Dynamic Sound Ripples */}
              <div className="flex flex-col items-center justify-center pt-2 pb-4">
                <div className="relative flex items-center justify-center">
                  {/* Ripple Rings when Speaking or Listening */}
                  {(callStatus === "speaking" || callStatus === "listening") && (
                    <>
                      <div className="absolute w-36 h-36 rounded-full bg-purple-500/20 animate-ping [animation-duration:2s]" />
                      <div className="absolute w-44 h-44 rounded-full border border-purple-400/20 animate-pulse [animation-duration:1.5s]" />
                    </>
                  )}

                  {/* Avatar Center Circle */}
                  <div
                    className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl relative z-10 ${
                      callStatus === "speaking"
                        ? "bg-gradient-to-tr from-[#6366f1] via-[#8b5cf6] to-[#ec4899] ring-4 ring-purple-400/40"
                        : callStatus === "listening"
                        ? "bg-gradient-to-tr from-emerald-500 to-teal-500 ring-4 ring-emerald-400/40"
                        : callStatus === "thinking"
                        ? "bg-gradient-to-tr from-indigo-600 to-blue-600 ring-4 ring-indigo-400/40"
                        : "bg-gradient-to-tr from-slate-700 to-indigo-800 ring-4 ring-white/10"
                    }`}
                  >
                    {callStatus === "speaking" && <Bot className="w-12 h-12 text-white animate-pulse" />}
                    {callStatus === "listening" && <Headphones className="w-12 h-12 text-white animate-bounce" />}
                    {callStatus === "thinking" && <Sparkles className="w-12 h-12 text-white animate-spin" />}
                    {callStatus === "connecting" && <PhoneIncoming className="w-12 h-12 text-yellow-300 animate-bounce" />}
                    {callStatus === "ended" && <PhoneOff className="w-12 h-12 text-rose-300" />}
                  </div>
                </div>

                {/* Dynamic Equalizer Audio Bars */}
                <div className="flex items-center gap-1.5 h-12 mt-5">
                  {audioBarHeights.map((h, idx) => (
                    <div
                      key={idx}
                      className="w-1.5 rounded-full transition-all duration-200"
                      style={{
                        height: `${Math.max(12, h)}px`,
                        backgroundColor:
                          callStatus === "speaking"
                            ? "#c084fc"
                            : callStatus === "listening"
                            ? "#34d399"
                            : "#64748b",
                        opacity: callStatus === "speaking" || callStatus === "listening" ? 1 : 0.4,
                      }}
                    />
                  ))}
                </div>

                {/* Status Pill */}
                <div className="mt-3">
                  {callStatus === "connecting" && (
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-yellow-500/20 text-yellow-300 text-xs font-semibold border border-yellow-500/30">
                      <span className="w-2 h-2 rounded-full bg-yellow-400 animate-ping" />
                      <span>Connecting to Convo Desk Hotline...</span>
                    </div>
                  )}
                  {callStatus === "speaking" && (
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/20 text-purple-200 text-xs font-semibold border border-purple-500/40 shadow-sm shadow-purple-500/20">
                      <Volume2 className="w-3.5 h-3.5 text-purple-300 animate-pulse" />
                      <span>Convo Desk is speaking...</span>
                    </div>
                  )}
                  {callStatus === "listening" && (
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-semibold border border-emerald-500/40 shadow-sm shadow-emerald-500/20">
                      <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      <span>Listening to you... (Speak naturally hands-free)</span>
                    </div>
                  )}
                  {callStatus === "thinking" && (
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/20 text-indigo-200 text-xs font-semibold border border-indigo-500/40 shadow-sm shadow-indigo-500/20">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-300 animate-spin" />
                      <span>AI Agent is thinking & updating intake...</span>
                    </div>
                  )}
                  {callStatus === "ended" && (
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-500/30">
                      <span>Call Ended</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Live Subtitles & Captions Box */}
              <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 space-y-3.5 shadow-lg backdrop-blur-sm">
                {/* Last Spoken Agent Utterance */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-purple-400 uppercase tracking-wider">
                    <Bot className="w-3.5 h-3.5" />
                    <span>Convo Desk</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed pl-5 font-normal">
                    {lastAgentUtterance || "👋 Welcome to Convo Desk! May I have your full name to get started?"}
                  </p>
                </div>

                <div className="border-t border-white/5" />

                {/* Live Caller Transcript */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      <span>You (Caller)</span>
                    </div>
                    {callStatus === "listening" && (
                      <span className="text-[10px] text-emerald-400/80 font-normal lowercase">
                        {liveUserTranscript ? "speech detected..." : "waiting for speech..."}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed pl-5 italic">
                    {liveUserTranscript ? (
                      <>
                        &ldquo;{liveUserTranscript}&rdquo;
                        {callStatus === "listening" && (
                          <span className="inline-block w-1.5 h-3.5 ml-1 bg-emerald-400 animate-pulse align-middle" />
                        )}
                      </>
                    ) : (
                      <span className="text-slate-500 not-italic">
                        [Listening for your voice... speak your name, phone number, enquiry, or date & time]
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Quick Slot Suggestions during Scheduling Step in Call Mode */}
              {intakeState.step === 3 && !intakeState.confirmed && (
                <div className="p-3 rounded-2xl bg-indigo-950/60 border border-indigo-500/30 space-y-2">
                  <div className="text-[11px] font-semibold text-indigo-300 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Available Appointment Openings (or say your preferred date):</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_TIME_SLOTS.map((slot, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleCallerSpoke(slot)}
                        className="text-xs px-3 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 transition-colors cursor-pointer"
                      >
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Collapsible Live Intake Notes & Progress Drawer */}
              {showCallNotes && (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span>Verified Intake Record</span>
                    <span className="text-[10px] font-semibold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-md">
                      Step {intakeState.step} of 4
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5">
                      <div className="text-[10px] text-slate-400">Customer Name</div>
                      <div className="font-semibold text-slate-200 truncate">
                        {intakeState.name || <span className="text-slate-500 font-normal">Pending</span>}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5">
                      <div className="text-[10px] text-slate-400">Phone Number</div>
                      <div className="font-semibold text-slate-200 truncate">
                        {intakeState.phone || <span className="text-slate-500 font-normal">Pending</span>}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5">
                      <div className="text-[10px] text-slate-400">Email Address</div>
                      <div className="font-semibold text-slate-200 truncate">
                        {intakeState.email || <span className="text-slate-500 font-normal">Pending</span>}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5">
                      <div className="text-[10px] text-slate-400">Appointment Status</div>
                      <div className="font-semibold text-slate-200 truncate">
                        {intakeState.confirmed ? (
                          <span className="text-emerald-400 font-bold">✅ Confirmed</span>
                        ) : (
                          <span className="text-yellow-400 font-normal">In Progress</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {intakeState.confirmed && (
                    <div className="pt-2">
                      <a
                        href={createGoogleCalendarLink(
                          intakeState.appointment || "Tomorrow at 10:00 AM",
                          intakeState.name || "Customer",
                          intakeState.email || "",
                          "CNV-HOTLINE",
                          intakeState.purpose || "Consultation",
                          intakeState.phone || ""
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold transition-all shadow-sm cursor-pointer"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" />
                        <span>Add Appointment to Google Calendar</span>
                        <ExternalLink className="w-3 h-3 opacity-80" />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Call Control Deck */}
            <div className="px-6 py-4 border-t border-white/10 bg-white/5 backdrop-blur-xs flex items-center justify-between relative z-10">
              <div className="flex items-center gap-2">
                {/* Mute Mic */}
                <button
                  onClick={toggleCallMute}
                  className={`p-3 rounded-2xl flex items-center gap-2 text-xs font-semibold transition-all cursor-pointer ${
                    isCallMuted
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                      : "bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10"
                  }`}
                  title={isCallMuted ? "Unmute Microphone" : "Mute Microphone"}
                >
                  {isCallMuted ? <MicOff className="w-4 h-4 text-rose-400" /> : <Mic className="w-4 h-4 text-emerald-400" />}
                  <span className="hidden sm:inline">{isCallMuted ? "Unmute Mic" : "Mute Mic"}</span>
                </button>

                {/* Speaker Volume */}
                <button
                  onClick={toggleSpeakerMute}
                  className={`p-3 rounded-2xl flex items-center gap-2 text-xs font-semibold transition-all cursor-pointer ${
                    isSpeakerMuted
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                      : "bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10"
                  }`}
                  title={isSpeakerMuted ? "Unmute Speaker Audio" : "Mute Speaker Audio"}
                >
                  {isSpeakerMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-purple-400" />}
                  <span className="hidden sm:inline">{isSpeakerMuted ? "Muted" : "Speaker"}</span>
                </button>
              </div>

              <div className="flex items-center gap-3">
                {/* Send Spoken Turn Now */}
                {liveUserTranscript.trim() && callStatus === "listening" && (
                  <button
                    onClick={submitCurrentSpeech}
                    className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-md shadow-indigo-600/30 transition-all cursor-pointer animate-pulse"
                    title="Send current spoken sentence immediately"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Turn</span>
                  </button>
                )}

                {/* Big Red End Call Button */}
                <button
                  onClick={endInboundCall}
                  className="px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
                  title="Hang up call"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span>End Call</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
