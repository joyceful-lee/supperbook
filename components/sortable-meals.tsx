"use client";
import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type HandleProps = ButtonHTMLAttributes<HTMLButtonElement> & { ref: (element: HTMLButtonElement | null) => void };
type RenderMeal = (id: string, index: number, handle: HandleProps) => ReactNode;

export default function SortableMeals({ items, labels, onReorder, renderItem }: {
  items: string[];
  labels: Record<string, string>;
  onReorder: (order: string[]) => void;
  renderItem: RenderMeal;
}) {
  const id = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return <DndContext id={id} sensors={sensors} collisionDetection={closestCenter}
    accessibility={{ announcements: {
      onDragStart: ({ active }) => `Picked up ${labels[String(active.id)]}. Use the arrow keys to change its position.`,
      onDragOver: ({ active, over }) => over ? `${labels[String(active.id)]}, position ${items.indexOf(String(over.id)) + 1} of ${items.length}.` : undefined,
      onDragEnd: ({ active, over }) => over ? `Placed ${labels[String(active.id)]} in position ${items.indexOf(String(over.id)) + 1}.` : "Meal order unchanged.",
      onDragCancel: () => "Meal order unchanged.",
    } }}
    onDragEnd={({ active, over }) => {
      if (over && active.id !== over.id)
        onReorder(arrayMove(items, items.indexOf(String(active.id)), items.indexOf(String(over.id))));
    }}>
    <SortableContext items={items} strategy={verticalListSortingStrategy}>
      <div className="meal-list">
        {items.map((mealId, index) => <SortableMeal key={mealId} id={mealId} index={index} renderItem={renderItem} />)}
      </div>
    </SortableContext>
  </DndContext>;
}
function SortableMeal({ id, index, renderItem }: { id: string; index: number; renderItem: RenderMeal }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return <article ref={setNodeRef} data-meal-id={id} className={`meal-row sortable-meal ${isDragging ? "sorting" : ""}`}
    style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 3 : undefined, position: "relative" }}>
    {renderItem(id, index, { ...attributes, ...listeners, ref: setActivatorNodeRef })}
  </article>;
}
