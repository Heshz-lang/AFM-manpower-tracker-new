export interface JobType {
  type: string;
  category: string;
}

export interface Personnel {
  ser_no: string;
  rank: string | null;
  name: string;
  trade: string | null;
  section: string | null;
  photo_url: string | null;
  custom_attributes: Record<string, string>;
  created_at: string;
}

export interface DailyAllocation {
  allocation_id: string;
  date: string;
  ser_no: string;
  rank: string | null;
  name: string | null;
  trade: string | null;
  section: string | null;
  type: string;
  category: string | null;
  craft_lab_job_id: string | null;
  remarks: string | null;
  created_at: string;
}

export interface Item {
  item_id: string;
  item_name: string;
}

export interface RegisteredJob {
  job_id: string;
  job_description: string | null;
  status: 'Pending' | 'On progress' | 'Completed';
  start_date: string | null;
  finish_date: string | null;
  created_at: string;
}

export interface JobItem {
  record_id: string;
  job_id: string;
  item_id: string;
  qty: number;
  item_name?: string;
}

export type JobStatus = 'Pending' | 'On progress' | 'Completed';

export const PRODUCTION_TYPES = ['Commercial production', 'Other production'];
