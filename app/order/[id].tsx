/**
 * Order detail — lifecycle actions: submit, confirm (reserves stock),
 * fulfil (devices auto-picked from RESERVED stock; accessories by quantity),
 * cancel, then invoice / shipment links.
 */
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { ApiStatusBadge } from '@/components/ui/api-status-badge';
import { Button } from '@/components/ui/button';
import { ErrorView, LoadingView, useToast, useConfirm } from '@/components/ui/feedback';
import { Spacing, Typography, type ThemeColors } from '@/constants/design';
import { useThemeColors } from '@/hooks/use-theme';
import { formatDateTime, formatMoney, variantSpec } from '@/lib/api/format';
import { apiFetch, ApiClientError } from '@/lib/api/client';
import { useOrder, useOrderAction, useFulfilOrder, useCreateInvoice } from '@/hooks/api/use-commerce';

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const confirmUi = useConfirm();

  const order = useOrder(id);
  const submit = useOrderAction(id, 'submit');
  const confirmOrder = useOrderAction(id, 'confirm');
  const cancelOrder = useOrderAction(id, 'cancel');
  const fulfil = useFulfilOrder(id);
  const createInvoice = useCreateInvoice();

  // Reserved devices (for phone fulfilment). One query, filtered per line.
  const reserved = useQuery({
    queryKey: ['devices', { status: 'RESERVED', pageSize: 100 }],
    queryFn: () => apiFetch('/api/devices?status=RESERVED&pageSize=100'),
    enabled: Boolean(id),
  });

  const [actionError, setActionError] = useState<string | null>(null);

  if (order.isLoading) return <LoadingView message="Loading order…" />;
  if (order.error) return <ErrorView error={order.error} retry={() => order.refetch()} />;
  const o = order.data!.data;
  const reservedDevices = (reserved.data?.data ?? []) as any[];

  const beforeFulfilment = ['DRAFT', 'SUBMITTED', 'CONFIRMED'];

  const doAction = async (mut: any, successText: string) => {
    setActionError(null);
    try {
      await mut.mutateAsync();
      show(successText, 'success');
      order.refetch();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? `${err.message}${err.details ? ` (${JSON.stringify(err.details)})` : ''}` : (err as Error).message);
    }
  };

  const onConfirm = () =>
    confirmUi({
      title: 'Confirm order?',
      message: 'This reserves stock such that this order cannot be overtaken by later orders.',
      actionLabel: 'Confirm order',
    }).then((ok) => {
      if (ok) doAction(confirmOrder, 'Order confirmed — stock reserved');
    });

  const onCancel = () =>
    confirmUi({
      title: 'Cancel order?',
      message: 'Reservations will be released. Cannot be undone once fulfilment has started.',
      actionLabel: 'Cancel order',
      danger: true,
    }).then((ok) => {
      if (ok) doAction(cancelOrder, 'Order cancelled');
    });

  const fulfilPayload = {
    items: o.items.map((item: any) => {
      if (item.variant.product.type === 'PHONE') {
        const devices = reservedDevices.filter(
          (d) => d.reservedOrderItemId === item.id,
        );
        return { orderItemId: item.id, deviceIds: devices.map((d) => d.id) };
      }
      return { orderItemId: item.id, quantity: item.quantity - item.fulfilledQty };
    }),
  };
  const anythingToFulfil = fulfilPayload.items.some(
    (i: any) => (i.deviceIds?.length ?? 0) > 0 || (i.quantity ?? 0) > 0
  );

  const onFulfil = () =>
    confirmUi({
      title: 'Fulfil everything possible?',
      message: 'Reserved accessories and all reserved devices will be fulfilled (stock leaves the warehouse).',
      actionLabel: 'Fulfil',
    }).then((ok) => {
      if (ok) doAction(fulfil, 'Fulfilment recorded');
    });

  const onInvoice = () =>
    confirmUi({
      title: 'Create invoice?',
      message: 'Creates the invoice for this fully fulfilled order. Credit limits are checked server-side.',
      actionLabel: 'Create invoice',
    }).then(async (ok) => {
      if (!ok) return;
      try {
        const res = await createInvoice.mutateAsync({ salesOrderId: o.id });
        const invoiceId = (res as any).data.id;
        show('Invoice created', 'success');
        router.push(`/invoice/${invoiceId}`);
      } catch (err) {
        setActionError(err instanceof ApiClientError ? err.message : 'Invoice creation failed');
      }
    });

  return (
    <Screen
      title={o.orderNumber}
      subtitle={`${o.customer.name} · ${o.warehouse.name} · ${formatDateTime(o.orderDate)}`}
      back>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <ApiStatusBadge status={o.status} />
          <Text style={styles.total}>{formatMoney(o.grandTotal)}</Text>
        </View>
        <View style={{ marginTop: 8 }}>
          <Text style={styles.meta}>Subtotal {formatMoney(o.subtotal)} · Discount {formatMoney(o.discountTotal)} · VAT {formatMoney(o.taxTotal)}</Text>
        </View>
      </Card>

      <Text style={styles.section}>Lines</Text>
      {o.items.map((item: any) => {
        const remaining = item.quantity - item.fulfilledQty;
        const lines = reservedDevices.filter((d) => d.reservedOrderItemId === item.id);
        const isPhone = item.variant.product.type === 'PHONE';
        return (
          <Card key={item.id}>
            <Text style={styles.variantName}>
              {item.variant.product.brand?.name} {item.variant.product.name}
            </Text>
            <Text style={styles.meta}>
              {item.variant.sku} · {variantSpec(item.variant)}
            </Text>
            <Text style={styles.meta}>
              Qty {item.quantity} · Fulfilled {item.fulfilledQty} · {formatMoney(item.unitPrice)} each
            </Text>
            {isPhone && o.status === 'CONFIRMED' && (
              <Text style={[styles.meta, { color: colors.warning }]}>
                {lines.length} reserved device(s) on this line
              </Text>
            )}
          </Card>
        );
      })}

      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      <View style={styles.actions}>
        {o.status === 'DRAFT' && (
          <Button text="Submit" onPress={() => doAction(submit, 'Order submitted')} disabled={submit.isPending} />
        )}
        {o.status === 'SUBMITTED' && (
          <Button text="Confirm (reserve stock)" onPress={onConfirm} disabled={confirmOrder.isPending} />
        )}
        {['CONFIRMED', 'PARTIALLY_FULFILLED'].includes(o.status) && (
          <Button
            text={anythingToFulfil ? 'Fulfil everything possible' : 'Nothing left to fulfil'}
            onPress={onFulfil}
            disabled={!anythingToFulfil || fulfil.isPending}
          />
        )}
        {o.status === 'FULFILLED' && (
          <Button text="Create invoice" onPress={onInvoice} disabled={createInvoice.isPending} />
        )}
        {o.status === 'INVOICED' && (
          <>
            <Button text="View invoice" onPress={() => router.push(`/invoice/${o.invoices?.[0]?.id ?? ''}`)} />
            <Button text="Return goods" variant="secondary"
              onPress={() => router.push(`/return/new?orderId=${o.id}`)} />
          </>
        )}
        {['PARTIALLY_FULFILLED', 'FULFILLED'].includes(o.status) && (
          <Button text="Return goods" variant="secondary"
            onPress={() => router.push(`/return/new?orderId=${o.id}`)} />
        )}
        {beforeFulfilment.includes(o.status) && (
          <Button text="Cancel order" variant="danger" onPress={onCancel} disabled={cancelOrder.isPending} />
        )}
      </View>
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    total: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.bold, color: colors.text },
    meta: { fontSize: Typography.sizes.xs, color: colors.textSecondary, marginTop: 2 },
    section: { marginTop: Spacing.lg, marginBottom: 6, fontSize: Typography.sizes.sm, fontWeight: Typography.weights.semibold, color: colors.textSecondary },
    variantName: { fontSize: Typography.sizes.base, fontWeight: Typography.weights.semibold, color: colors.text },
    error: { color: colors.danger, fontSize: Typography.sizes.sm, padding: Spacing.md },
    actions: { marginTop: Spacing.lg, gap: Spacing.sm },
  });

