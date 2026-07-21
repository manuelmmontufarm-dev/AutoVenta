export function hasUnansweredCustomerMessage(
  lastCustomerMessageAt: Date | null,
  lastAssistantMessageAt: Date | null,
): boolean {
  return Boolean(lastCustomerMessageAt &&
    (!lastAssistantMessageAt || lastAssistantMessageAt < lastCustomerMessageAt));
}
