// Compatibilidad con las pruebas y vistas existentes. La única implementación
// vive en contratos para que frontend y API validen exactamente el mismo JSON.
export {
  buildReconciliationReview,
  emptyReconciliationChoices,
  type ReconciliationChoice,
  type ReconciliationChoices,
} from '@kora/contracts';
