# Log to Metrics Exporter

This service ingests log data and exports it as metrics for monitoring and analysis. Key considerations include consistency of the exported metrics, throughput to handle high log volumes, and robustness against failures during processing.

## Constraints
- Ensure data consistency during metric aggregation.
- Optimize for high throughput to accommodate large log streams.
- Implement error handling to manage transient failures and ensure reliability.

## Running the Service
1. Install dependencies: `npm install`
2. Start the service: `npm run start`

Ensure environment variables are set as needed in a .env file.