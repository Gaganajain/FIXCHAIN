"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Filter,
  Clock,
  User,
  Phone,
  CreditCard,
  ExternalLink,
  ChevronRight,
  MessageCircle,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/lib/shadcn";
import { cn } from "@/lib/utils";
import {
  TicketPriority,
  TicketStatus,
  TicketCategory,
  Ticket,
} from "@/types";

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  upi_payment: "UPI Payment",
  soundbox: "Soundbox",
  merchant_qr: "Merchant QR",
  settlement: "Settlement",
  platform_outage: "Platform Outage",
  other: "Other",
};

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
  escalated: "Escalated",
};

const mockTickets: Ticket[] = [
  {
    id: "TK-2024-001",
    customerId: "CUST-8842",
    customerName: "Rahul Sharma",
    customerEmail: "rahul.sharma@email.com",
    customerPhone: "+91 98765 43210",
    category: "upi_payment",
    priority: "critical",
    status: "open",
    subject: "UPI payment failed but amount deducted",
    description: "Customer attempted a ₹2,500 UPI payment to Merchant XYZ. Payment failed at gateway but amount was deducted from bank account.",
    amount: 2500,
    transactionId: "TXN-778899",
    createdAt: "2024-11-19T10:15:00Z",
    updatedAt: "2024-11-19T10:15:00Z",
    assignedTo: "Agent-01",
    incidentId: "INC-001",
    channel: "app",
  },
  {
    id: "TK-2024-002",
    customerId: "CUST-8843",
    customerName: "Priya Patel",
    customerEmail: "priya.patel@email.com",
    customerPhone: "+91 98765 43211",
    category: "soundbox",
    priority: "high",
    status: "in_progress",
    subject: "Soundbox not announcing payments",
    description: "Merchant soundbox device stopped announcing successful payments after firmware update.",
    amount: 0,
    transactionId: undefined,
    createdAt: "2024-11-19T09:45:00Z",
    updatedAt: "2024-11-19T11:30:00Z",
    assignedTo: "Agent-03",
    incidentId: "INC-002",
    channel: "call",
  },
  {
    id: "TK-2024-003",
    customerId: "CUST-8844",
    customerName: "Amit Singh",
    customerEmail: "amit.singh@email.com",
    customerPhone: "+91 98765 43212",
    category: "merchant_qr",
    priority: "medium",
    status: "resolved",
    subject: "QR code not scanning at checkout",
    description: "Customer unable to scan merchant QR code at retail store.",
    amount: 450,
    transactionId: "TXN-778901",
    createdAt: "2024-11-19T08:20:00Z",
    updatedAt: "2024-11-19T09:10:00Z",
    resolvedAt: "2024-11-19T09:10:00Z",
    assignedTo: "Agent-02",
    incidentId: undefined,
    satisfactionScore: 5,
    channel: "web",
  },
  {
    id: "TK-2024-004",
    customerId: "CUST-8845",
    customerName: "Sneha Reddy",
    customerEmail: "sneha.reddy@email.com",
    customerPhone: "+91 98765 43213",
    category: "settlement",
    priority: "high",
    status: "open",
    subject: "Settlement not received for 3 days",
    description: "Merchant settlement for last 3 days not credited to bank account.",
    amount: 45000,
    transactionId: undefined,
    createdAt: "2024-11-19T07:10:00Z",
    updatedAt: "2024-11-19T07:10:00Z",
    assignedTo: "Agent-04",
    incidentId: "INC-003",
    channel: "email",
  },
  {
    id: "TK-2024-005",
    customerId: "CUST-8846",
    customerName: "Vikram Joshi",
    customerEmail: "vikram.joshi@email.com",
    customerPhone: "+91 98765 43214",
    category: "platform_outage",
    priority: "critical",
    status: "escalated",
    subject: "Complete platform outage - cannot process any payments",
    description: "Multiple merchants reporting complete inability to process payments across all channels.",
    amount: 0,
    transactionId: undefined,
    createdAt: "2024-11-19T06:00:00Z",
    updatedAt: "2024-11-19T08:45:00Z",
    assignedTo: "Agent-01",
    incidentId: "INC-004",
    channel: "call",
  },
  {
    id: "TK-2024-006",
    customerId: "CUST-8847",
    customerName: "Anita Desai",
    customerEmail: "anita.desai@email.com",
    customerPhone: "+91 98765 43215",
    category: "upi_payment",
    priority: "medium",
    status: "closed",
    subject: "Duplicate UPI charge",
    description: "Customer charged twice for a single UPI transaction.",
    amount: 1200,
    transactionId: "TXN-778905",
    createdAt: "2024-11-18T16:30:00Z",
    updatedAt: "2024-11-18T17:45:00Z",
    resolvedAt: "2024-11-18T17:45:00Z",
    assignedTo: "Agent-02",
    incidentId: undefined,
    satisfactionScore: 4,
    channel: "app",
  },
];

export function TicketCenter({ navigate }: any) {
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<TicketCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const filteredTickets = mockTickets.filter((t) => {
    const matchesSearch =
      t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPriority = priorityFilter === "all" || t.priority === priorityFilter;
    const matchesCategory = categoryFilter === "all" || t.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    return matchesSearch && matchesPriority && matchesCategory && matchesStatus;
  });

  const priorityOptions: TicketPriority[] = ["low", "medium", "high", "critical"];
  const categoryOptions: TicketCategory[] = ["upi_payment", "soundbox", "merchant_qr", "settlement", "platform_outage", "other"];
  const statusOptions: TicketStatus[] = ["open", "in_progress", "resolved", "closed", "escalated"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ticket Center</h1>
          <p className="text-muted-foreground">Manage customer tickets and track resolution progress</p>
        </div>
        <Button onClick={() => setSelectedTicket(null)}>
          <CreditCard className="mr-2 h-4 w-4" /> New Ticket
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search tickets, customers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                left={<Search className="h-4 w-4 text-muted-foreground" />}
              />
            </div>
            <div className="flex-1">
              <Select value={priorityFilter === "all" ? "" : priorityFilter} onValueChange={(v) => setPriorityFilter(v as TicketPriority | "all")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  {priorityOptions.map((p) => (
                    <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Select value={categoryFilter === "all" ? "" : categoryFilter} onValueChange={(v) => setCategoryFilter(v as TicketCategory | "all")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Select value={statusFilter === "all" ? "" : statusFilter} onValueChange={(v) => setStatusFilter(v as TicketStatus | "all")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {statusOptions.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Button variant="outline" className="w-full">
                <Filter className="mr-2 h-4 w-4" /> Filters
              </Button>
            </div>
            <div className="flex-1">
              <Button variant="outline" className="w-full">
                <ExternalLink className="mr-2 h-4 w-4" /> Export
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total", value: mockTickets.length },
          { label: "Open", value: mockTickets.filter((t) => t.status === "open").length },
          { label: "In Progress", value: mockTickets.filter((t) => t.status === "in_progress").length },
          { label: "Resolved", value: mockTickets.filter((t) => t.status === "resolved").length },
        ].map((s) => (
          <Card key={s.label} className="p-3 text-center">
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tickets Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Tickets ({filteredTickets.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHeader className="w-20">Ticket ID</TableHeader>
                  <TableHeader>Customer</TableHeader>
                  <TableHeader className="w-40">Category</TableHeader>
                  <TableHeader className="w-24">Priority</TableHeader>
                  <TableHeader className="w-32">Status</TableHeader>
                  <TableHeader className="w-24">Channel</TableHeader>
                  <TableHeader className="w-20">Amount</TableHeader>
                  <TableHeader className="w-24">Time</TableHeader>
                  <TableHeader className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTickets.map((ticket) => (
                  <TableRow
                    key={ticket.id}
                    onClick={() => setSelectedTicket(ticket)}
                    className="cursor-pointer hover:bg-accent/50 transition-colors"
                  >
                    <TableCell className="font-medium text-sm">{ticket.id}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-medium">
                          {ticket.customerName.split(" ").map((n) => n[0]).join("")}
                        </div>
                        <div>
                          <div className="text-sm font-medium">{ticket.customerName}</div>
                          <div className="text-xs text-muted-foreground">{ticket.customerEmail}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[ticket.category]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge variant={ticket.priority === "critical" ? "destructive" : ticket.priority === "high" ? "outline" : "secondary"} className="text-xs capitalize">
                        {PRIORITY_LABELS[ticket.priority]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Badge variant="outline" className="text-xs capitalize">{STATUS_LABELS[ticket.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ticket.channel}</TableCell>
                    <TableCell className="text-sm">
                      {ticket.amount ? `₹${ticket.amount.toLocaleString()}` : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(ticket.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
                {filteredTickets.length === 0 && (
                  <TableRow>
                    <TableCell className="h-32 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center h-full">
                        <p className="text-sm">No tickets found matching your filters.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Ticket Detail Drawer */}
      <AnimatePresence>
        {selectedTicket && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            className="fixed inset-y-0 right-0 z-50 w-full md:w-[500px] bg-background border-l border-border shadow-2xl flex flex-col"
          >
            <div className="p-6 border-b border-border flex items-center justify-between">
              <button
                onClick={() => setSelectedTicket(null)}
                className="p-2 rounded-md hover:bg-accent text-muted-foreground"
              >
                <ChevronRight className="h-5 w-5 rotate-180" />
              </button>
              <h2 className="text-lg font-bold">{selectedTicket.id}</h2>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => {}}>
                  <MessageCircle className="h-4 w-4" /> Reply
                </Button>
                <Button variant="outline" size="sm" onClick={() => {}}>
                  <ExternalLink className="h-4 w-4" /> View Timeline
                </Button>
              </div>
            </div>
            <CardContent className="p-6 overflow-y-auto">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold mb-2">{selectedTicket.subject}</h3>
                  <p className="text-muted-foreground">{selectedTicket.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg border border-border bg-muted/50">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Customer</div>
                    <div className="text-sm font-medium">{selectedTicket.customerName}</div>
                    <div className="text-xs text-muted-foreground">{selectedTicket.customerEmail}</div>
                    <div className="text-xs text-muted-foreground">{selectedTicket.customerPhone}</div>
                  </div>
                  <div className="p-3 rounded-lg border border-border bg-muted/50">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Transaction</div>
                    <div className="text-sm font-medium">{selectedTicket.transactionId || "—"}</div>
                    <div className="text-xs text-muted-foreground">{selectedTicket.amount ? `₹${selectedTicket.amount.toLocaleString()}` : "—"}</div>
                    <div className="text-xs text-muted-foreground">{selectedTicket.channel}</div>
                  </div>
                </div>
                <div className="p-3 rounded-lg border border-border bg-muted/50">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Assigned Agent</div>
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-medium">
                      {selectedTicket.assignedTo?.split("-")[1] || "A"}
                    </div>
                    <div className="text-sm font-medium">{selectedTicket.assignedTo}</div>
                  </div>
                </div>
                {selectedTicket.incidentId && (
                  <div className="p-3 rounded-lg border border-amber-100 bg-amber-50">
                    <div className="flex items-center gap-2 text-sm">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <div>
                        <div className="font-medium text-amber-800">Related Incident</div>
                        <div className="text-amber-600">{selectedTicket.incidentId}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
