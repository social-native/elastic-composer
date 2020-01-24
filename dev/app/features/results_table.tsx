import React, {useContext, useState} from 'react';
import {observer} from 'mobx-react';
import styled from 'styled-components';

import Context from '../context';

import {
    Grid,
    DragDropProvider,
    Table,
    TableHeaderRow,
    TableColumnReordering,
  } from '@devexpress/dx-react-grid-material-ui';

const Container = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    border: 1px solid black;
    margin: 20px;
`;

const Header = styled.div`
    height: 50px;
    display: flex;
    justify-content center;
    align-items: center;
    margin: 5px;
    max-width: 500px;
`;

const Paginate = styled.div`
  height: 30px;
  width: 100px;
  border: 1px solid black;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  margin: 3px;
`;

export default observer(() => {
    const creatorCRM = useContext(Context.creatorCRM);

    // return <UriInput type="text" value={uri} onChange={c => setUri(c.target.value)} />;
    const [columns] = useState([
        { name: 'score', title: 'Score'},
        { name: 'id', title: 'ID' },
        { name: 'email', title: 'email' },
        { name: 'country', title: 'country' },
        { name: 'version', title: 'version' },
      ]);
      const [tableColumnExtensions] = useState([
        { columnName: 'gender', width: 100 },
      ]);
    
      return (
          <Container>
            <Header>
            <Paginate onClick={creatorCRM.prevPage}>
                Previous
            </Paginate>
            <Paginate onClick={creatorCRM.nextPage}>
                Next
            </Paginate>
            </Header>
            <Grid
                rows={creatorCRM.results || []}
                columns={columns}
                getCellValue={(a,v) => {return v === 'score' ? a._score : a._source[v]}}
            >
                <DragDropProvider />
                <Table
                columnExtensions={tableColumnExtensions}
                />
                <TableColumnReordering
                defaultOrder={['city', 'gender', 'car', 'name']}
                />
                <TableHeaderRow />
            </Grid>
          </Container>

      );
});
