export type ImageInfo = { url: string; key: string; mimeType: string; size: number; width: number; height: number };
export type PostStatus = 'REQUESTED' | 'PUBLISHED' | 'PROGRESSING' | 'COMPLETED';
export type CheckStatus = 'PENDING' | 'CHECKED' | 'NOT_CHECKED' | 'EXPIRED';

export type Post = {
  id: string;
  title: string;
  status: PostStatus;
  image: ImageInfo | null;
  connects: number;
  price: number | null;
  approval: boolean;
  viewCount: number;
  viewers: number;
  clientId: string;
  clientName: string;
  holderId: string | null;
  holderName: string | null;
  progressingAt: string | null;
  progressingExpiresAt: string | null;
  /** Set while the Customer's checking info waits for the Client: the countdown is stopped ("Client Checking"). */
  progressingPausedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Me =
  | { kind: 'admin'; id: string; name: string | null; email: string }
  | {
      kind: 'user';
      id: string;
      role: 'CLIENT' | 'CUSTOMER';
      name: string;
      email: string;
      image: ImageInfo | null;
      isBlocked: boolean;
      s_counts?: number;
      b_counts?: number;
      cartLimit?: number;
    };

export type UserRow = {
  id: string;
  role: 'CLIENT' | 'CUSTOMER';
  name: string;
  email: string;
  image: ImageInfo | null;
  isBlocked: boolean;
  online: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  s_counts?: number;
  b_counts?: number;
  cartLimit?: number;
};

export type Check = {
  id: string;
  postId: string;
  customerId: string;
  url: string;
  status: CheckStatus;
  reviewedAt: string | null;
  createdAt: string;
};

/** A file sent in chat; `url` only works for members of the conversation. */
export type Attachment = {
  name: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  isImage: boolean;
  url: string;
};

export type Message = {
  id: string;
  conversationId: string;
  type: 'TEXT' | 'CHECK_REQUEST' | 'SYSTEM' | 'FILE';
  body: string | null;
  attachment: Attachment | null;
  createdAt: string;
  sender: { kind: 'user' | 'admin'; id: string; name: string; role: string } | null;
  checkSubmissionId: string | null;
  check: Check | null;
};

export type Participant = { kind: 'user' | 'admin'; id: string; name: string; email: string; role: string; image: ImageInfo | null };

export type Conversation = {
  id: string;
  type: 'DEAL' | 'ADMIN_CLIENT' | 'ADMIN_CUSTOMER';
  postId: string | null;
  post: Post | null;
  participants: Participant[];
  title: string;
  lastMessageAt: string | null;
  lastMessage: { body: string | null; type: string } | null;
  unread: number;
  isParticipant: boolean;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  postId: string | null;
  conversationId: string | null;
  readAt: string | null;
  createdAt: string;
};
