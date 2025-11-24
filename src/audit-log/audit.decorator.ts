import { AuditLogService, AuditLogData } from './audit-log.service';

export interface AuditOptions {
  entityName: string;
  action?: string;
  entityIdResolver?: (result: any) => number;
  changeSummary?: (result: any) => string;
}

export function Audit(options: AuditOptions) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const auditService: AuditLogService = this.auditLogService;

      if (!auditService) {
        // If no audit service is available, just execute the method
        return method.apply(this, args);
      }

      try {
        // Execute the original method
        const result = await method.apply(this, args);

        // Log the audit entry asynchronously
        const entityId = options.entityIdResolver
          ? options.entityIdResolver(result)
          : result?.id;
        if (entityId) {
          const auditData: AuditLogData = {
            action: options.action || propertyName.toUpperCase(),
            entityName: options.entityName,
            entityId: entityId,
            userId: this.getCurrentUserId?.() || null, // Use null instead of hardcoded 1
            changeSummary: options.changeSummary
              ? options.changeSummary(result)
              : undefined,
          };

          // Log asynchronously to not block the operation
          auditService.logAsync(auditData);
        }

        return result;
      } catch (error) {
        // Log failed operations too (with a default entityId of 0 for failed operations)
        const auditData: AuditLogData = {
          action: `${options.action || propertyName.toUpperCase()}_FAILED`,
          entityName: options.entityName,
          entityId: 0, // Use 0 for failed operations
          userId: this.getCurrentUserId?.() || null, // Use null instead of hardcoded 1
          changeSummary: `Failed: ${error.message}`,
        };

        auditService.logAsync(auditData);
        throw error;
      }
    };
  };
}
