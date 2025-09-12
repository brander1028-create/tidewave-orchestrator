# Overview

This is a SERP (Search Engine Results Page) analysis application focused on Naver blog ranking analysis. The application allows users to input keywords and discover top-ranking blogs, analyze their content, extract relevant keywords, and track search rankings. It's designed specifically for Korean market analysis with features like n-gram keyword extraction, mobile-first scraping, and Naver API integration.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query for server state management
- **UI Components**: Shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom design system variables
- **Forms**: React Hook Form with Zod validation

## Backend Architecture
- **Runtime**: Node.js with Express server
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints for SERP analysis operations
- **File Structure**: Monorepo structure with shared types between client/server

## Data Storage
- **ORM**: Drizzle ORM for type-safe database operations
- **Database**: PostgreSQL with Neon serverless driver
- **Schema**: Normalized tables for SERP jobs, discovered blogs, analyzed posts, and extracted keywords
- **Migrations**: Drizzle-kit for database schema management

## Core Services

### Web Scraping Service
- **Engine**: HTTP + RSS based content scraping (no browser dependencies)
- **Strategy**: RSS feeds → Mobile HTML parsing (m.blog.naver.com) → Fallback seed URLs
- **Rate Limiting**: 1-2 concurrent requests with 1-3 second delays
- **Error Handling**: Graceful fallback system when APIs unavailable

### NLP Service
- **Approach**: N-gram based keyword extraction
- **Language Support**: Korean text processing with stopword filtering
- **Scoring**: Frequency-based relevance scoring for keyword ranking

### SERP Analysis Pipeline
- **Discovery**: Blog identification through keyword search
- **Content Analysis**: Post collection and keyword extraction
- **Ranking Verification**: Search result position tracking
- **Export**: CSV output for analysis results

## External Dependencies

### Required APIs
- **Naver Open API**: Blog search functionality (requires client ID/secret)
- **Naver Search Ads API**: Optional for search volume data

### Web Scraping Stack
- **node-fetch**: HTTP request library for web content extraction
- **fast-xml-parser**: RSS feed parsing for blog post collection
- **User Agent Spoofing**: Mobile browser headers for better access

### Development Tools
- **Replit Integration**: Development environment optimization
- **TypeScript**: Full type safety across frontend/backend
- **ESBuild**: Production bundling for server-side code

### Database & Hosting
- **Neon Database**: Serverless PostgreSQL hosting
- **Connection Pooling**: Built-in with Neon serverless driver

## Security & Compliance
- **Robots.txt Compliance**: Respects website scraping policies
- **Rate Limiting**: Conservative request patterns to avoid blocking
- **Error Boundaries**: Graceful degradation when services fail
- **Environment Variables**: Secure API key management