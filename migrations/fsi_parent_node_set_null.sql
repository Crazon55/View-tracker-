-- Frame delete must NOT wipe nodes inside the frame.
-- Was: parent_node_id REFERENCES nodes(id) ON DELETE CASCADE
-- Now: ON DELETE SET NULL (children stay; parent link cleared).
-- Safe to re-run. Also apply fsiApi.deleteNode orphan step (client) as belt-and-suspenders.

ALTER TABLE nodes DROP CONSTRAINT IF EXISTS nodes_parent_node_id_fkey;

ALTER TABLE nodes
  ADD CONSTRAINT nodes_parent_node_id_fkey
  FOREIGN KEY (parent_node_id) REFERENCES nodes(id) ON DELETE SET NULL;
