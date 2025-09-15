# Overview

This is a comprehensive ranking and review monitoring application designed for blog and shopping platform tracking. The system provides real-time monitoring of search rankings, review analytics, event detection, and alert management across multiple platforms including blogs and e-commerce sites. The application features a modern dashboard with data visualization, automated alert systems, and comprehensive analytics tools for tracking ranking performance and review health.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript using Vite as the build tool
- **UI Library**: shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: Zustand for client-side state management with persistence middleware
- **Data Fetching**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Charts**: Recharts for data visualization including trend charts, distributions, and heatmaps

## Backend Architecture
- **Runtime**: Node.js with Express.js server framework
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM configured for PostgreSQL
- **Development**: Hot module replacement via Vite middleware in development
- **Mock API**: In-memory storage layer for development and testing with `/api/mock/*` endpoints

## Database Design
- **Primary Database**: PostgreSQL with Neon serverless driver
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Key Tables**:
  - `rank_time_series`: Raw ranking data with timestamps
  - `rank_aggregated`: Performance-optimized aggregated ranking metrics
  - `metric_time_series`: Product and review health metrics
  - `events`: System events and alerts tracking
  - `submissions`: User-submitted targets for monitoring
  - `tracked_targets`: Configured monitoring targets
  - `settings`: System configuration and user preferences

## Key Features Architecture
- **Multi-Platform Monitoring**: Separate tracking for blog rankings and shopping platform rankings with device-specific data (mobile/PC)
- **Event System**: Real-time event detection for ranking changes, new content, and abuse detection with overlay visualization on charts
- **Alert Engine**: Rule-based alerting system with cooldown periods, severity levels, and customizable thresholds
- **Analytics Dashboard**: Comprehensive KPI tracking with trend analysis, distribution charts, and calendar heatmaps
- **Review Analytics**: Specialized monitoring for product review rankings and abuse detection

## Data Flow
- **Ranking Collection**: Automated data collection from multiple sources with configurable intervals
- **Event Processing**: Real-time event detection and alert generation based on configurable rules
- **Data Aggregation**: Background processing for performance metrics and trend calculations
- **Visualization Pipeline**: Real-time data transformation for chart components with event overlay support

# External Dependencies

## Core Dependencies
- **@neondatabase/serverless**: Neon PostgreSQL serverless database driver
- **drizzle-orm**: TypeScript ORM for database operations
- **@tanstack/react-query**: Server state management and caching
- **@radix-ui/***: Comprehensive UI component primitives
- **recharts**: Chart library for data visualization
- **zustand**: Lightweight state management
- **wouter**: Minimal client-side routing

## Development Tools
- **Vite**: Build tool and development server
- **TypeScript**: Type safety and development tooling
- **Tailwind CSS**: Utility-first CSS framework
- **ESBuild**: Fast JavaScript bundler for production builds
- **@replit/vite-plugin-***: Replit-specific development enhancements

## Monitoring and Analytics
- **Mock API Layer**: In-memory storage for development with plans for real connector integration
- **Rate Limiting**: Built-in rate limiting for API requests
- **Session Management**: PostgreSQL session storage with connect-pg-simple
- **Export System**: Multi-format data export capabilities (CSV, JSON, Excel)

## Future Integration Points
- **External APIs**: Designed for integration with blog and shopping platform APIs
- **Real-time Updates**: WebSocket support for live data updates
- **Notification Services**: Email and webhook integrations for alert delivery
- **Third-party Analytics**: Integration points for external analytics platforms