import GameState from "../GameState";
import GameStateMutator from "../GameStateMutator";
import ReplaceEntityMutator from "./ReplaceEntityMutator";
import AddDiffsMutator from "./AddDiffsMutator";
import { GameStateDiff } from "../../interfaces";
import { CardClass, GameTag, Zone } from "../../enums";

export default class TagChangeMutator implements GameStateMutator {
	public id: number;
	public tag: number;
	public value: number;

	constructor(id: number, tag: number, value: number) {
		this.id = +id;
		this.tag = +tag;
		this.value = +value;
	}

	public applyTo(state: GameState): GameState {
		const oldEntity = state.getEntity(this.id);
		if (!oldEntity) {
			console.error(
				"Cannot change tag on non-existent entity #" + this.id,
			);
			return state;
		}

		let newEntity = oldEntity.setTag(this.tag, this.value);
		const creator = state.getEntity(this.value);
		if (
			this.tag === GameTag.DISPLAYED_CREATOR &&
			creator &&
			creator.cardId === "VAC_941" &&
			(oldEntity.getZone() === Zone.HAND ||
				oldEntity.getZone() === Zone.DECK) &&
			oldEntity.getClass() !== CardClass.WARLOCK
		) {
			// Announce Darkness reports the new creator for hidden replacements
			// without a ChangeEntity/CardID. Do not retain a known neutral card
			// such as Barrel of Sludge. Already-revealed Warlock results are valid.
			newEntity = newEntity.invalidateCardIdentity();
		}

		if (newEntity === oldEntity) {
			// tag value did not change
			return state;
		}

		const diff: GameStateDiff = {
			entity: this.id,
			tag: this.tag,
			previous: oldEntity.getTag(this.tag),
			current: this.value,
		};

		return state
			.apply(new ReplaceEntityMutator(newEntity))
			.apply(new AddDiffsMutator([diff]));
	}
}
