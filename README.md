 Clashvers ⚔️

A full-stack coding battle platform built with TypeScript, designed to provide a competitive programming experience through real-time challenges, matchmaking, leaderboards, and cloud-native deployment practices.

This project was developed to gain hands-on experience with modern application development, containerization, Kubernetes, Infrastructure as Code, and monitoring tools commonly used in DevOps environments.

---

 Overview

Clashvers consists of:

* A Next.js frontend for the user interface
* A Node.js/Express backend API
* Supabase PostgreSQL as the database layer
* Docker for containerization
* Kubernetes for orchestration
* Terraform for infrastructure provisioning
* Prometheus and Grafana for monitoring

---

Architecture


                    ┌─────────────────┐
                    │     Browser     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Next.js Client  │
                    │  (TypeScript)   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Node.js Backend │
                    │  Express API    │
                    │  TypeScript     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Supabase DB     │
                    │ PostgreSQL      │
                    └─────────────────┘


The application follows a 3-tier architecture:

1. Presentation Layer – Next.js Frontend
2. Application Layer – Node.js Backend
3. Data Layer – Supabase PostgreSQL

---

## Repository Structure

```text
.
├── client/              # Frontend application
├── server/              # Backend API
├── supabase/            # Database configuration
├── terraform/           # Infrastructure as Code
├── k8s/                 # Kubernetes manifests
├── monitoring/          # Prometheus & Grafana
├── docker-compose.yml
└── README.md
```

---

## Tech Stack

### Frontend

* Next.js
* React
* TypeScript

### Backend

* Node.js
* Express.js
* Socket.io
* TypeScript

### Database

* Supabase
* PostgreSQL

### DevOps & Cloud

* Docker
* Docker Compose
* Kubernetes
* Terraform
* AWS EC2

### Monitoring

* Prometheus
* Grafana

---

## Key Features

### Application Features

* User Authentication
* Real-Time Communication
* Coding Challenge Platform
* Matchmaking System
* Leaderboard Support
* Responsive User Interface

### DevOps Features

* Dockerized Frontend and Backend
* Infrastructure Provisioning with Terraform
* Kubernetes Deployment Manifests
* Centralized Monitoring Setup
* Cloud Deployment Workflow

---

## Local Development

Clone the repository:

```bash
git clone https://github.com/<your-username>/clashvers.git
cd clashvers
```

Start services:

```bash
docker-compose up -d
```

Verify containers:

```bash
docker ps
```

Stop services:

```bash
docker-compose down
```

---

## Kubernetes Deployment

Deploy resources:

```bash
kubectl apply -f k8s/
```

Verify deployment:

```bash
kubectl get pods
kubectl get svc
```

---

## Terraform Infrastructure

Initialize Terraform:

```bash
cd terraform
terraform init
```

Review execution plan:

```bash
terraform plan
```

Provision infrastructure:

```bash
terraform apply
```



## Monitoring Stack

The project includes monitoring configurations using:

* Prometheus for metrics collection
* Grafana for visualization and dashboards

Example monitoring use cases:

* Container health monitoring
* CPU and memory utilization
* Application availability
* Infrastructure performance tracking



## What I Learned

Through this project, I gained practical experience with:

* Full-Stack TypeScript Development
* Docker and Containerization
* Kubernetes Fundamentals
* Infrastructure as Code using Terraform
* AWS Cloud Services
* Monitoring and Observability
* Deployment Automation


## Future Improvements

* AI-generated coding challenges
* Rating system (ELO based)
* Tournament mode
* CI/CD using GitHub Actions
* Argo CD GitOps deployment
* Advanced analytics dashboard


## Author

Prathmesh Ughade

Final Year Computer Engineering Student

Focused on Cloud Computing, DevOps, Kubernetes, Infrastructure Automation, and Backend Systems.

