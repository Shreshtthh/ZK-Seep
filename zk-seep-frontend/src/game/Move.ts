import type { Card } from './Card';
import type { Pile } from './Pile';

/**
 * Move types in Seep.
 *
 * 1: Throw      — Place card on floor as new loose pile
 * 2: Build      — Card + loose piles → new unfixed house (value 9-13)
 * 3: Cement     — Card matches unfixed pile value → fix it
 * 4: MergeFix   — Card + loose piles match an unfixed pile → merge into fixed
 * 5: AddToFixed — Card + loose piles match a fixed pile → add to it
 * 6: DirectFix  — Card directly onto fixed pile of same value
 * 7: PickUp     — Card value matches pile sum → capture all
 */
export enum MoveType {
    Throw = 1,
    Build = 2,
    Cement = 3,
    MergeFix = 4,
    AddToFixed = 5,
    DirectFix = 6,
    PickUp = 7,
}

export interface Move {
    type: MoveType;
    card: Card;
    piles?: Pile[];
}

/** Whether a move type requires a ZK proof (hand possession proof). */
export function moveRequiresZkProof(type: MoveType): boolean {
    return type >= 2 && type <= 6;
}

/** Get a human-readable description of a move type. */
export function describeMoveType(type: MoveType): string {
    switch (type) {
        case MoveType.Throw: return 'Throw';
        case MoveType.Build: return 'Build House';
        case MoveType.Cement: return 'Cement House';
        case MoveType.MergeFix: return 'Merge + Fix';
        case MoveType.AddToFixed: return 'Add to Fixed';
        case MoveType.DirectFix: return 'Direct Fix';
        case MoveType.PickUp: return 'Pick Up';
        default: return 'Unknown';
    }
}
