import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { cancelOrder, completeOrder, createOrder, getOrder, listOrders, shipOrder } from '../services/order-service.js';
import { ok } from '../utils/response.js';
import { positiveId, requiredText } from '../utils/validation.js';

const router = Router();

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const data = await createOrder(req.user.id, req.body ?? {});
    const message = req.body?.deliveryMode === 'shipping' ? '下单成功，请等待卖家发货' : '下单成功，请与卖家约定面交';
    ok(res, data, message);
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    ok(res, await listOrders(req.query, req.user.id));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    ok(res, await getOrder(positiveId(req.params.id, '订单'), req.user.id));
  } catch (err) {
    next(err);
  }
});

router.put('/:id/ship', requireAuth, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id, '订单');
    const carrier = requiredText(req.body?.carrier, '快递公司', 60);
    const trackingNo = requiredText(req.body?.trackingNo, '快递单号', 80);
    await shipOrder(id, req.user.id, { carrier, trackingNo });
    ok(res, null, '订单已发货');
  } catch (err) {
    next(err);
  }
});

router.put('/:id/complete', requireAuth, async (req, res, next) => {
  try {
    await completeOrder(positiveId(req.params.id, '订单'), req.user.id);
    ok(res, null, '交易已完成');
  } catch (err) {
    next(err);
  }
});

router.put('/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    await cancelOrder(positiveId(req.params.id, '订单'), req.user);
    ok(res, null, '订单已取消');
  } catch (err) {
    next(err);
  }
});

export default router;
