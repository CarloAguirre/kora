CREATE TABLE "scheduled_job_runs" (
	"job_name" varchar(80) NOT NULL,
	"run_date" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb,
	CONSTRAINT "scheduled_job_runs_job_name_run_date_pk" PRIMARY KEY("job_name","run_date")
);
