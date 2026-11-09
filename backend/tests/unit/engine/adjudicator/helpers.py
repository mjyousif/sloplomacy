"""Builders for units and orders shared by the adjudicator tests."""

from domain.board import Unit
from domain.orders import Order, OrderType


def _unit(uid, power, unit_type, province, coast=None):
    return Unit(id=uid, power=power, unit_type=unit_type, province=province, coast=coast)


def _order(
    unit, order_type=OrderType.HOLD, target=None, aux=None, target_coast=None, via_convoy=False
):
    return Order(
        unit_id=unit.id,
        power=unit.power,
        unit_type=unit.unit_type,
        origin=unit.province,
        origin_coast=unit.coast,
        order_type=order_type,
        target=target,
        target_coast=target_coast,
        aux_unit_origin=aux,
        via_convoy=via_convoy,
        is_explicit=True,
    )
