"""预约与场地 API。"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from ...db import q_all, q_one
from ...deps import csrf_protect, get_current_user, require_roles
from ...deps import require_verified
from . import service as svc

router = APIRouter(tags=["scheduling"])


class HoldIn(BaseModel):
    slot_id: str
    ticket_id: str
    idempotency_key: str | None = Field(default=None, max_length=80)


class ConfirmIn(BaseModel):
    contact_name: str = Field(min_length=1, max_length=80)
    contact_phone: str = Field(min_length=5, max_length=30)
    idempotency_key: str | None = Field(default=None, max_length=80)


class RescheduleIn(BaseModel):
    new_slot_id: str
    idempotency_key: str | None = Field(default=None, max_length=80)


class CancelIn(BaseModel):
    reason: str = Field(default="", max_length=200)


class CheckInIn(BaseModel):
    code: str = Field(min_length=4, max_length=40)


def appt_view(a: dict, with_code: bool = False) -> dict:
    slot = q_one("SELECT * FROM service_slots WHERE id = ?", (a["slot_id"],))
    event = q_one("SELECT * FROM service_events WHERE id = ?", (slot["event_id"],)) if slot else None
    location = q_one("SELECT name, building_room, address_note FROM service_locations WHERE id=?",
                     (event["location_id"],)) if event else None
    view = {
        "id": a["id"], "ticket_id": a["ticket_id"], "status": a["status"],
        "slot": {"id": a["slot_id"], "start_at": slot["start_at"] if slot else "",
                 "end_at": slot["end_at"] if slot else "",
                 "event_title": event["title"] if event else "",
                 "service_date": event["service_date"] if event else "",
                 "location": location, "bring_note": event["bring_note"] if event else ""},
        "hold_expires_at": a["hold_expires_at"],
        "contact_name": a["contact_name"], "contact_phone": a["contact_phone"],
    }
    if with_code and a["status"] == "CONFIRMED":
        view["checkin_code"] = a["checkin_code"]
    return view


@router.get("/service-events")
def events(date_from: str | None = Query(default=None)):
    return svc.list_events(date_from)


@router.get("/service-slots")
def slots(event_id: str = Query(...), user: dict = Depends(get_current_user)):
    return svc.list_slots(event_id)


@router.post("/appointment-holds", dependencies=[Depends(csrf_protect), Depends(require_verified)])
def create_hold(payload: HoldIn, user: dict = Depends(get_current_user)):
    a = svc.create_hold(user_id=user["id"], slot_id=payload.slot_id,
                        ticket_id=payload.ticket_id,
                        idempotency_key=payload.idempotency_key)
    return appt_view(a)


@router.post("/appointments/{appointment_id}/confirm", dependencies=[Depends(csrf_protect)])
def confirm(appointment_id: str, payload: ConfirmIn, user: dict = Depends(get_current_user)):
    a = svc.confirm_booking(user_id=user["id"], appointment_id=appointment_id,
                            contact_name=payload.contact_name,
                            contact_phone=payload.contact_phone,
                            idempotency_key=payload.idempotency_key)
    return appt_view(a, with_code=True)


@router.post("/appointments/{appointment_id}/reschedule", dependencies=[Depends(csrf_protect)])
def do_reschedule(appointment_id: str, payload: RescheduleIn,
                  user: dict = Depends(get_current_user)):
    a = svc.reschedule(user_id=user["id"], appointment_id=appointment_id,
                       new_slot_id=payload.new_slot_id,
                       idempotency_key=payload.idempotency_key)
    return appt_view(a, with_code=True)


@router.post("/appointments/{appointment_id}/cancel", dependencies=[Depends(csrf_protect)])
def cancel(appointment_id: str, payload: CancelIn, user: dict = Depends(get_current_user)):
    a = svc.cancel_appointment(user_id=user["id"], appointment_id=appointment_id,
                               reason=payload.reason)
    return appt_view(a)


@router.post("/staff/appointments/{appointment_id}/check-in", dependencies=[Depends(csrf_protect)])
def staff_check_in(appointment_id: str, payload: CheckInIn,
                   staff: dict = Depends(require_roles("staff", "admin"))):
    a = svc.check_in(staff_id=staff["id"], appointment_id=appointment_id, code=payload.code)
    view = appt_view(a)
    phone = view["contact_phone"]
    view["contact_phone"] = phone[:3] + "****" + phone[-4:] if len(phone) >= 7 else "****"
    return view


@router.get("/appointments/mine")
def my_appointments(user: dict = Depends(get_current_user)):
    svc.expire_holds()
    rows = q_all("SELECT * FROM appointments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
                 (user["id"],))
    return [appt_view(a, with_code=True) for a in rows]
