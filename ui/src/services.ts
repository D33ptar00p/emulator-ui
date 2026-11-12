/** Services with hand-built pages. Every other service uses the generic explorer (#/svc/<id>). */
export interface ServiceDef {
  id: string; // route id
  catalogId: string; // botocore / emulator service id
  label: string;
  fullName: string;
  description: string;
  icon: string; // generated monogram tile (public/icons, scripts/build_icons.py)
}

const icon = (catalogId: string) => `/icons/${catalogId}.svg`;

export const SERVICES: ServiceDef[] = [
  { id: "dynamodb", catalogId: "dynamodb", label: "DynamoDB", fullName: "Amazon DynamoDB", description: "Tables & items", icon: icon("dynamodb") },
  { id: "s3", catalogId: "s3", label: "S3", fullName: "Amazon Simple Storage Service", description: "Buckets & objects", icon: icon("s3") },
  { id: "lambda", catalogId: "lambda", label: "Lambda", fullName: "AWS Lambda", description: "Functions", icon: icon("lambda") },
  { id: "apigateway", catalogId: "apigateway", label: "API Gateway", fullName: "Amazon API Gateway", description: "REST & HTTP APIs", icon: icon("apigateway") },
  { id: "stepfunctions", catalogId: "stepfunctions", label: "Step Functions", fullName: "AWS Step Functions", description: "State machines", icon: icon("stepfunctions") },
  { id: "eventbridge", catalogId: "events", label: "EventBridge", fullName: "Amazon EventBridge", description: "Event buses & rules", icon: icon("events") },
  { id: "sqs", catalogId: "sqs", label: "SQS", fullName: "Amazon Simple Queue Service", description: "Queues", icon: icon("sqs") },
  { id: "appsync", catalogId: "appsync", label: "AppSync", fullName: "AWS AppSync", description: "GraphQL APIs", icon: icon("appsync") },
  { id: "iam", catalogId: "iam", label: "IAM", fullName: "AWS Identity and Access Management", description: "Roles", icon: icon("iam") },
];

export function serviceById(id: string | undefined): ServiceDef | undefined {
  return SERVICES.find((s) => s.id === id);
}

/** Curated page for a catalog id, if one exists (e.g. "events" -> EventBridge page). */
export function curatedForCatalogId(catalogId: string): ServiceDef | undefined {
  return SERVICES.find((s) => s.catalogId === catalogId);
}
