# APIMatic Context Plugin Grounding Log

This document records the APIMatic SDK generation and API schema grounding for PayPal v2/v1 endpoints utilized by AegisPay.

## Validated Endpoints
- **Orders v2**: `/v2/checkout/orders` (Multi-purchase units, Intent: `AUTHORIZE`, `CAPTURE`)
- **Payments v2**: `/v2/payments/authorizations/{id}/capture`, `/v2/payments/captures/{id}/refund`
- **Vault v3**: `/v3/vault/setup-tokens`, `/v3/vault/payment-tokens`
- **Disputes v1**: `/v1/customer/disputes`, `/v1/customer/disputes/{id}/provide-evidence`, `/v1/customer/disputes/{id}/adjudicate`
- **Shipment Tracking v1**: `/v1/shipping/trackers-batch`
