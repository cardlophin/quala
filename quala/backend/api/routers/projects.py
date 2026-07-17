"""Proyectos + grafo de proyecto.

Contrato: mock-api.ts fetch/create/updateProject, fetchProjectGraph,
saveProjectGraph. El grafo, que el mock guardaba en localStorage, aqui se
persiste en SQLite (tabla project_graphs).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from .. import store
from ..schemas import Project, ProjectCreate, ProjectGraph, ProjectUpdate

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[Project])
def list_projects():
    return store.list_projects()


@router.post("", response_model=Project)
def create_project(payload: ProjectCreate):
    return store.create_project(payload.model_dump(exclude_none=True))


@router.get("/{project_id}", response_model=Project)
def get_project(project_id: str):
    project = store.get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail=f"Proyecto {project_id} no encontrado")
    return project


@router.patch("/{project_id}", response_model=Project)
def update_project(project_id: str, patch: ProjectUpdate):
    updated = store.update_project(project_id, patch.model_dump(exclude_unset=True))
    if updated is None:
        raise HTTPException(status_code=404, detail=f"Proyecto {project_id} no encontrado")
    return updated


@router.get("/{project_id}/graph", response_model=ProjectGraph)
def get_project_graph(project_id: str, connection_id: str | None = Query(default=None)):
    graph = store.get_graph(project_id)
    if graph is None:
        return store.default_graph(project_id, connection_id)
    graph["connection_id"] = connection_id
    return graph


@router.put("/{project_id}/graph", status_code=204)
def save_project_graph(project_id: str, graph: ProjectGraph):
    store.save_graph(graph.model_dump())
